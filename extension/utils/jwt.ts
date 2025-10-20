/**
 * JWT (JSON Web Token) utilities for Google Service Account authentication
 * Implements RS256 signing for OAuth 2.0 JWT Bearer tokens
 */

/**
 * Base64URL encode (URL-safe base64 without padding)
 */
function base64UrlEncode(data: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Convert string to ArrayBuffer
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Import PKCS#8 PEM private key for signing
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  try {
    // Validate PEM format
    if (!pem.includes("BEGIN PRIVATE KEY")) {
      throw new Error("Invalid PEM format: Missing BEGIN PRIVATE KEY header");
    }
    if (!pem.includes("END PRIVATE KEY")) {
      throw new Error("Invalid PEM format: Missing END PRIVATE KEY footer");
    }

    // Remove PEM header/footer and all whitespace/newlines
    // Handle both literal \n strings and actual newline characters
    const pemContents = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\\n/g, "") // Remove literal \n strings (when key is in JSON format)
      .replace(/\n/g, "")  // Remove actual newlines
      .replace(/\r/g, "")  // Remove carriage returns
      .replace(/\t/g, "")  // Remove tabs
      .replace(/\s+/g, ""); // Remove all remaining whitespace

    console.log("[JWT] PEM content length after cleaning:", pemContents.length);
    console.log("[JWT] First 50 chars:", pemContents.substring(0, 50));
    console.log("[JWT] Last 50 chars:", pemContents.substring(pemContents.length - 50));

    // Validate base64 content
    if (pemContents.length === 0) {
      throw new Error("PEM content is empty after removing headers");
    }

    // Check if the content is valid base64
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(pemContents)) {
      throw new Error(
        "Invalid base64 content in private key. The private_key field must contain only valid base64 characters. " +
        "Make sure you copied the ENTIRE private_key field from your service account JSON file, " +
        "including the BEGIN/END markers and all \\n characters."
      );
    }

    // Decode base64
    let binaryDer: string;
    try {
      binaryDer = atob(pemContents);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to decode base64 private key. This usually means:\n` +
        `1. The private_key is incomplete or corrupted\n` +
        `2. You didn't copy the entire key from the JSON file\n` +
        `3. The key contains invalid characters\n\n` +
        `Original error: ${errorMsg}\n\n` +
        `Debug info:\n` +
        `- PEM length: ${pemContents.length}\n` +
        `- First chars: ${pemContents.substring(0, 20)}...\n` +
        `- Last chars: ...${pemContents.substring(pemContents.length - 20)}`
      );
    }

    const binaryDerArray = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      binaryDerArray[i] = binaryDer.charCodeAt(i);
    }

    console.log("[JWT] Binary DER length:", binaryDerArray.length);

    // Import as CryptoKey
    return await crypto.subtle.importKey(
      "pkcs8",
      binaryDerArray,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
  } catch (error) {
    console.error("[JWT] Failed to import private key:", error);
    throw error;
  }
}

/**
 * Sign data using RS256
 */
async function sign(privateKey: CryptoKey, data: string): Promise<string> {
  const dataBuffer = stringToArrayBuffer(data);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    dataBuffer
  );
  return base64UrlEncode(signature);
}

/**
 * Create JWT assertion for Google Service Account
 */
export async function createJWTAssertion(
  clientEmail: string,
  privateKey: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // Token valid for 1 hour

  // JWT Header
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  // JWT Payload (Claims)
  const payload = {
    iss: clientEmail, // Issuer (service account email)
    scope: scope, // Scopes
    aud: "https://oauth2.googleapis.com/token", // Audience
    iat: now, // Issued at
    exp: expiry, // Expires at
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(
    stringToArrayBuffer(JSON.stringify(header))
  );
  const encodedPayload = base64UrlEncode(
    stringToArrayBuffer(JSON.stringify(payload))
  );

  // Create signing input
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Import private key and sign
  const key = await importPrivateKey(privateKey);
  const signature = await sign(key, signingInput);

  // Return complete JWT
  return `${signingInput}.${signature}`;
}

/**
 * Exchange JWT for access token
 */
export async function getAccessTokenFromJWT(
  jwtAssertion: string
): Promise<string> {
  const tokenUrl = "https://oauth2.googleapis.com/token";

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtAssertion,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}
