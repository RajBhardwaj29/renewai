export const MAX_BATCH_FILES = 10;
export const MAX_BATCH_PDF_BYTES = 10 * 1024 * 1024;
export type UploadStatus = "queued" | "analyzing" | "ready" | "failed" | "duplicate" | "saving" | "save_failed" | "saved";
export type UploadItem<T> = {
  id: string;
  file: File;
  status: UploadStatus;
  hash?: string;
  analysis?: T;
  error?: string;
  existingId?: string;
  duplicateOf?: string;
  retryable?: boolean;
};

export class UploadFailure extends Error {
  constructor(message: string, readonly existingId?: string, readonly duplicate = false) {
    super(message);
  }
}

export async function hashPDF(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

// Browser-memory queue only. Analysis is read-only; saving always belongs to an
// explicit review action. A single pump serializes analysis, including retries.
export class BatchUploadQueue<T> {
  private items: UploadItem<T>[] = [];
  private listeners = new Set<() => void>();
  private running = false;
  private generation = 0;
  private controller?: AbortController;

  constructor(private analyze: (file: File, signal: AbortSignal) => Promise<T>,
    private hash: (file: File) => Promise<string> = hashPDF) {}

  getSnapshot = () => this.items;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish() { this.listeners.forEach(listener => listener()); }
  update(id: string, patch: Partial<UploadItem<T>>) {
    this.items = this.items.map(item => item.id === id ? { ...item, ...patch } : item);
    this.publish();
  }
  select(files: File[]) {
    if (this.running || this.items.length) throw new Error("Start a new batch before choosing more files.");
    if (!files.length || files.length > MAX_BATCH_FILES) throw new Error("Choose between 1 and 10 PDFs. No files were added.");
    this.items = files.map((file, index) => {
      const error = !file.name.toLowerCase().endsWith(".pdf") ? "Only PDF files are supported."
        : !file.size ? "Uploaded PDF is empty."
        : file.size > MAX_BATCH_PDF_BYTES ? "This PDF exceeds the 10 MiB file limit." : undefined;
      return { id: `file-${index}`, file, status: error ? "failed" : "queued", error, retryable: !error };
    });
    this.publish();
  }
  reset() {
    if (this.running || this.items.some(item => item.status === "saving")) return false;
    this.generation += 1;
    this.items = [];
    this.publish();
    return true;
  }
  stop() {
    this.generation += 1;
    this.controller?.abort();
    this.running = false;
  }
  retry(id: string) {
    const item = this.items.find(item => item.id === id);
    if (!item || item.status !== "failed" || !item.retryable) return;
    this.update(id, { status: "queued", error: undefined });
    void this.start();
  }
  async start() {
    if (this.running) return;
    this.running = true;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    try {
      while (generation === this.generation) {
        const item = this.items.find(candidate => candidate.status === "queued");
        if (!item) break;
        this.update(item.id, { status: "analyzing", error: undefined });
        try {
          const hash = item.hash ?? await this.hash(item.file);
          if (generation !== this.generation) return;
          // A renamed byte-identical PDF still counts as a duplicate. A failed
          // original can be retried directly without analyzing its copy as well.
          const original = this.items.find(candidate => candidate.id !== item.id && candidate.hash === hash && !candidate.duplicateOf);
          this.update(item.id, { hash });
          if (original) {
            this.update(item.id, { status: "duplicate", duplicateOf: original.id,
              error: `Same PDF as ${original.file.name}. Review or retry that file instead.` });
            continue;
          }
          const analysis = await this.analyze(item.file, controller.signal);
          if (generation !== this.generation) return;
          this.update(item.id, { status: "ready", analysis });
        } catch (error) {
          if (generation !== this.generation) return;
          this.update(item.id, error instanceof UploadFailure && error.duplicate
            ? { status: "duplicate", existingId: error.existingId, error: error.message }
            : { status: "failed", retryable: true,
              error: error instanceof UploadFailure ? error.message : "We couldn't analyze this PDF right now. Please try again." });
        }
      }
    } finally {
      if (generation === this.generation) this.running = false;
    }
  }
}
