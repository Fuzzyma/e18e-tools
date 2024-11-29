import assert from "assert";

type FetchOptions = Parameters<typeof fetch>[1];

export async function fetchWithProgress<T = unknown>(
  url: string,
  options: FetchOptions & {
    onProgress?: (curr: number, total: number) => void;
  }
) {
  const { onProgress, ...fetchOptions } = options;

  let response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const contentLengthHeader = response.headers.get("content-length");

  if (!onProgress) {
    return response.json() as T;
  }

  const contentLength = parseInt(contentLengthHeader ?? "0", 10);

  assert(response.body, "Body expected when fetching " + url);

  const reader = response.body.getReader();

  let receivedLength = 0;
  let chunks = [];
  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    receivedLength += value.length;

    onProgress(receivedLength, contentLength);
  }

  let chunksAll = new Uint8Array(receivedLength);
  let position = 0;
  for (let chunk of chunks) {
    chunksAll.set(chunk, position);
    position += chunk.length;
  }

  // Step 5: decode into a string
  let result = new TextDecoder("utf-8").decode(chunksAll);

  // We're done!
  return JSON.parse(result) as T;
}
