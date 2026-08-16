import { supabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/lib/api";


export async function authFetch(
  path: string,
  options: RequestInit = {}
) {
  const {
    data: {
      session,
    },
    error,
  } =
    await supabase.auth.getSession();


  /*
   * Do not throw here.
   *
   * Return a normal 401 Response instead so every
   * page can handle authentication exactly like
   * an API response.
   */
  if (
    error ||
    !session
  ) {
    return new Response(
      JSON.stringify({
        detail:
          "Authentication required.",
      }),
      {
        status: 401,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }


  const headers =
    new Headers(
      options.headers
    );


  headers.set(
    "Authorization",
    `Bearer ${session.access_token}`
  );


  const url =
    path.startsWith("http")
      ? path
      : `${API_BASE_URL}${
          path.startsWith("/")
            ? path
            : `/${path}`
        }`;


  return fetch(
    url,
    {
      ...options,
      headers,
    }
  );
}