const API_URL =
  process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is missing."
  );
}

export const API_BASE_URL =
  API_URL.replace(/\/$/, "");