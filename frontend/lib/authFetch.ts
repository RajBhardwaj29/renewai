import {
  supabase,
} from "@/lib/supabase";

import {
  API_BASE_URL,
} from "@/lib/api";


let refreshPromise:
  ReturnType<
    typeof supabase.auth.refreshSession
  >
  | null =
  null;


/*
 * Build a normal JSON 401 response so callers
 * can handle authentication failures exactly
 * like backend API responses.
 */
function authenticationRequiredResponse() {

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


/*
 * Resolve relative RenewAI API paths against
 * the configured FastAPI backend URL.
 */
function buildUrl(
  path: string
) {

  if (
    path.startsWith(
      "http"
    )
  ) {

    return path;
  }


  return (
    `${API_BASE_URL}${
      path.startsWith("/")
        ? path
        : `/${path}`
    }`
  );
}


/*
 * Send one authenticated request using the
 * supplied access token.
 */
async function authenticatedRequest(
  url: string,
  accessToken: string,
  options: RequestInit
) {

  const headers =
    new Headers(
      options.headers
    );


  headers.set(
    "Authorization",
    `Bearer ${accessToken}`
  );


  return fetch(
    url,
    {
      ...options,
      headers,
    }
  );
}


/*
 * Refresh only once when multiple requests
 * receive 401 at approximately the same time.
 *
 * Contract pages currently load the contract
 * and reminder timeline in parallel, so this
 * prevents both requests from independently
 * trying to refresh the session.
 */
async function refreshSupabaseSession() {

  if (
    !refreshPromise
  ) {

    refreshPromise =
      supabase.auth.refreshSession();


    refreshPromise.finally(
      () => {

        refreshPromise =
          null;

      }
    );
  }


  return refreshPromise;
}


/*
 * RenewAI authenticated fetch helper.
 *
 * Flow:
 *
 * 1. Read the current Supabase session.
 * 2. Send request using its access token.
 * 3. If backend accepts it, return normally.
 * 4. If backend responds 401, refresh session.
 * 5. Retry exactly once with the new token.
 * 6. If refresh fails, return a normal 401.
 */
export async function authFetch(
  path: string,
  options: RequestInit = {}
) {

  const url =
    buildUrl(
      path
    );


  /*
   * getSession() retrieves the browser session
   * and lets Supabase refresh it when required.
   */
  const {
    data: {
      session,
    },

    error:
      sessionError,
  } =
    await supabase.auth.getSession();


  if (
    sessionError
    ||
    !session
    ||
    !session.access_token
  ) {

    return (
      authenticationRequiredResponse()
    );
  }


  /*
   * First attempt using the current session.
   */
  let response =
    await authenticatedRequest(
      url,
      session.access_token,
      options
    );


  /*
   * Most requests should finish here.
   *
   * Do not refresh the Supabase session unless
   * the backend actually rejects the token.
   */
  if (
    response.status !== 401
  ) {

    return response;
  }


  /*
   * Backend rejected the token.
   *
   * Refresh the session once and retry.
   */
  try {

    const {
      data: {
        session:
          refreshedSession,
      },

      error:
        refreshError,
    } =
      await refreshSupabaseSession();


    if (
      refreshError
      ||
      !refreshedSession
      ||
      !refreshedSession.access_token
    ) {

      return (
        authenticationRequiredResponse()
      );
    }


    response =
      await authenticatedRequest(
        url,
        refreshedSession.access_token,
        options
      );


    return response;


  } catch (
    error
  ) {

    console.error(
      "RenewAI authentication refresh failed:",
      error
    );


    return (
      authenticationRequiredResponse()
    );
  }
}