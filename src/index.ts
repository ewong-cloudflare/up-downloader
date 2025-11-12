import type { R2Bucket } from '@cloudflare/workers-types';

interface Env {
  BUCKET: R2Bucket;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
}

async function getUploadUrl(request: Request, _env: Env, key: string, uploadId: string, partNumber: number): Promise<string> {
  // Return a URL to our worker instead of directly to R2
  const url = new URL(request.url);
  return `${url.origin}/api/upload-part/${key}?partNumber=${partNumber}&uploadId=${uploadId}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Disposition'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,OPTIONS',
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/initiate-upload') {
      const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB
      const MAX_PARTS = 10000;
      const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB - must match frontend

      let filename: string;
      let fileSize: number;

      try {
        console.log('Received initiate-upload request');
        const body = await request.json();
        const parsed = body as { filename: string; fileSize: number };
        filename = parsed.filename;
        fileSize = parsed.fileSize;
        console.log('File details:', { filename, fileSize });
      } catch (error) {
        console.error('Error parsing request:', error);
        return new Response(JSON.stringify({
          error: 'Invalid request',
          details: 'Could not parse request body'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Use multipart upload for files larger than chunk size
      if (fileSize > CHUNK_SIZE) {
        // Calculate number of parts
        const partCount = Math.ceil(fileSize / CHUNK_SIZE);
        
        // Validate chunk size
        if (CHUNK_SIZE < MIN_PART_SIZE) {
          return new Response(JSON.stringify({
            error: 'Invalid chunk size',
            details: `Chunk size must be at least ${MIN_PART_SIZE} bytes (5MB)`
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Validate against R2 limits
        if (partCount > MAX_PARTS) {
          return new Response(JSON.stringify({
            error: 'File too large',
            details: `File would require ${partCount} parts, but R2 only supports ${MAX_PARTS} parts maximum`
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        // Create multipart upload with CORS headers
        console.log('Creating multipart upload for:', filename);
        const multipartUpload = await env.BUCKET.createMultipartUpload(filename, {
          customMetadata: {
            'upload-type': 'multipart'
          },
          httpMetadata: {
            contentType: 'application/octet-stream',
            cacheControl: 'no-cache'
          }
        });
        console.log('Multipart upload created with ID:', multipartUpload.uploadId);
        const uploadId = multipartUpload.uploadId;
        const parts = [];
        
        for (let partNumber = 1; partNumber <= partCount; partNumber++) {
          const uploadUrl = await getUploadUrl(request, env, filename, uploadId, partNumber);
          parts.push({ url: uploadUrl, partNumber });
        }

        const response = {
          type: 'multipart',
          uploadId,
          parts,
          filename
        };
        console.log('Sending response:', response);
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // For smaller files, return a direct upload URL
      return new Response(JSON.stringify({ 
        type: 'simple',
        uploadUrl: '/api/upload',
        filename
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/list-files') {
      const files = await env.BUCKET.list();
      return new Response(JSON.stringify(files.objects), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/upload') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { 
          status: 405,
          headers: corsHeaders
        });
      }

      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return new Response('No file provided', { 
          status: 400,
          headers: corsHeaders
        });
      }

      // Store the file in R2
      await env.BUCKET.put(file.name, await file.arrayBuffer());
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/abort-multipart') {
      const { filename, uploadId } = await request.json();

      try {
        // Abort the multipart upload
        const upload = await env.BUCKET.resumeMultipartUpload(filename, uploadId);
        await upload.abort();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ 
          error: 'Failed to abort multipart upload',
          details: error.message || 'Unknown error'
        }), { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/api/complete-multipart') {
      try {
        const { filename, uploadId, parts } = await request.json();
        
        if (!filename || !uploadId || !Array.isArray(parts)) {
          return new Response(JSON.stringify({
            error: 'Invalid request',
            details: 'Missing required fields'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Sort parts by part number to ensure correct order
        const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
        
        // Complete the multipart upload
        const upload = await env.BUCKET.resumeMultipartUpload(filename, uploadId);
        await upload.complete(sortedParts);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ 
          error: 'Failed to complete multipart upload',
          details: error.message || 'Unknown error'
        }), { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname.startsWith('/api/upload-part/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method !== 'PUT') {
        return new Response('Method not allowed', { 
          status: 405,
          headers: corsHeaders
        });
      }

      const key = url.pathname.replace('/api/upload-part/', '');
      const uploadId = url.searchParams.get('uploadId');
      const partNumber = parseInt(url.searchParams.get('partNumber') || '0', 10);

      if (!uploadId || !partNumber) {
        return new Response('Missing uploadId or partNumber', {
          status: 400,
          headers: corsHeaders
        });
      }

      try {
        // Resume the multipart upload
        const multipartUpload = await env.BUCKET.resumeMultipartUpload(key, uploadId);
        
        // Upload the part directly using the worker
        if (!request.body) {
          throw new Error('Request body is required');
        }
        
        // Read the request body into a buffer
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        // Concatenate chunks into a single buffer
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
        
        // Upload the part
        const part = await multipartUpload.uploadPart(
          partNumber,
          buffer
        );

        return new Response(JSON.stringify({
          success: true,
          etag: part.etag
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({
          error: 'Failed to upload part',
          details: error.message || 'Unknown error'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname.startsWith('/api/download/')) {
      const key = decodeURIComponent(url.pathname.replace('/api/download/', ''));
      
      try {
        const object = await env.BUCKET.get(key);
        
        if (!object) {
          return new Response('File not found', {
            status: 404,
            headers: corsHeaders
          });
        }

        const headers = new Headers(corsHeaders);
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(key)}`);
        headers.set('Content-Length', object.size.toString());
        
        // Stream the response
        return new Response(object.body as BodyInit, { 
          headers,
          status: 200
        });
      } catch (error: any) {
        return new Response(JSON.stringify({
          error: 'Failed to download file',
          details: error.message || 'Unknown error'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};