import { API_ENDPOINTS } from './api';

import {
  GeneratePromptParams,
  OptimizePromptSectionParams,
  OptimizePromptSectionResponse,
  OptimizePromptSectionStreamData,
  StreamResponseData,
} from '@/types/agentConfig';
import { fetchWithAuth, getAuthHeaders } from '@/lib/auth';
// @ts-ignore
const fetch = fetchWithAuth;

/**
 * Get Request Headers
 */
const getHeaders = () => {
  return getAuthHeaders();
};

export const generatePromptStream = async (
  params: GeneratePromptParams,
  onData: (data: StreamResponseData) => void,
  onError?: (err: any) => void,
  onComplete?: () => void
) => {
  try {
    const response = await fetch(API_ENDPOINTS.prompt.generate, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let hasError = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.replace('data: ', ''));
            if (json.success) {
              onData(json.data);
            } else if (json.success === false && json.error) {
              // Handle error response from backend
              hasError = true;
              if (onError) onError(json.error);
            }
          } catch (e) {
            if (onError) onError(e);
          }
        }
      }
    }
    // Only call onComplete if no error occurred
    if (!hasError && onComplete) onComplete();
  } catch (err) {
    if (onError) onError(err);
    if (onComplete) onComplete();
  }
};

export const optimizePromptSection = async (
  params: OptimizePromptSectionParams,
): Promise<OptimizePromptSectionResponse> => {
  const response = await fetch(API_ENDPOINTS.prompt.optimize, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params),
  });

  const result = await response.json();
  return result.data as OptimizePromptSectionResponse;
};

export const optimizePromptSectionStream = async (
  params: OptimizePromptSectionParams,
  onData: (data: OptimizePromptSectionStreamData) => void,
  onError?: (err: any) => void,
  onComplete?: () => void,
  options?: { signal?: AbortSignal }
) => {
  try {
    const response = await fetch(API_ENDPOINTS.prompt.optimizeStream, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(params),
      signal: options?.signal,
    });

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let hasError = false;

    try {
      while (true) {
        let readResult;
        try {
          readResult = await reader.read();
        } catch (readError: any) {
          if (readError?.name === 'AbortError' || readError?.name === 'AbortSignal') {
            break;
          }
          throw readError;
        }

        const { value, done } = readResult;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }

          try {
            const json = JSON.parse(line.replace('data: ', ''));
            if (json.success) {
              onData(json.data as OptimizePromptSectionStreamData);
            } else if (json.success === false && json.error) {
              hasError = true;
              if (onError) onError(json.error);
            }
          } catch (e) {
            if (onError) onError(e);
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancel errors.
      }
    }

    if (!hasError && onComplete && !options?.signal?.aborted) {
      onComplete();
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return;
    }
    if (onError) onError(err);
    if (onComplete && !options?.signal?.aborted) onComplete();
  }
};
