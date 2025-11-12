import React, { useState } from 'react';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface FileUploaderProps {
  onUploadComplete?: () => void;
}

export function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState<string>('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setMessage('Initiating upload...');
      console.log('Initiating upload for file:', { name: file.name, size: file.size });
      
      const response = await fetch('/api/initiate-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, fileSize: file.size }),
      });

      let uploadData;
      try {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Server error: ${data.error || response.statusText}`);
        }
        uploadData = data;
        console.log('Upload initiated:', uploadData);
      } catch (parseError) {
        throw new Error('Failed to parse server response');
      }

      if (uploadData.type === 'multipart') {
        await handleMultipartUpload(file, uploadData);
      } else {
        await handleSimpleUpload(file, uploadData);
      }
    } catch (error) {
      setMessage('Upload failed: ' + (error as Error).message);
    }
  };

  const handleMultipartUpload = async (file: File, uploadData: any) => {
    // Use 10MB chunks to match worker configuration
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    let uploadedSize = 0;
    const completedParts: { partNumber: number; etag: string }[] = [];

    try {
      for (const part of uploadData.parts) {
        const start = (part.partNumber - 1) * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        // Send the upload request through our worker
        const response = await fetch(part.url, {
          method: 'PUT',
          body: chunk,
          headers: {
            'Content-Type': 'application/octet-stream'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to upload part ${part.partNumber} (Status: ${response.status})`);
        }

        const result = await response.json();
        if (!result.etag) {
          throw new Error(`No ETag received for part ${part.partNumber}`);
        }

        completedParts.push({
          partNumber: part.partNumber,
          etag: result.etag
        });

        uploadedSize += chunk.size;
        setProgress({
          loaded: uploadedSize,
          total: file.size,
          percentage: Math.round((uploadedSize / file.size) * 100),
        });
      }

      // Complete the multipart upload
      const response = await fetch('/api/complete-multipart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          uploadId: uploadData.uploadId,
          parts: completedParts
        })
      });

      if (!response.ok) {
        throw new Error('Failed to complete multipart upload');
      }

      setMessage('Upload complete!');
      setProgress(null);
      onUploadComplete?.();
    } catch (error) {
      console.error('Upload failed:', error);
      // Abort the multipart upload if it fails
      try {
        await fetch('/api/abort-multipart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            uploadId: uploadData.uploadId
          })
        });
      } catch (abortError) {
        console.error('Failed to abort multipart upload:', abortError);
      }

      setMessage('Upload failed: ' + (error as Error).message);
      setProgress(null);
    }
  };

  const handleSimpleUpload = async (file: File, uploadData: any) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100)
          });
        }
      };

      await new Promise((resolve, reject) => {
        xhr.open('POST', uploadData.uploadUrl);
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });

      setMessage('Upload complete!');
      setProgress(null);
      onUploadComplete?.();
    } catch (error) {
      setMessage('Upload failed: ' + (error as Error).message);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <input
        type="file"
        onChange={handleFileSelect}
        className="mb-4"
      />
      {progress && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${progress.percentage}%` }}
          ></div>
          <div className="text-sm text-gray-600 mt-1">
            {Math.round(progress.loaded / 1024 / 1024)}MB of {Math.round(progress.total / 1024 / 1024)}MB ({progress.percentage}%)
          </div>
        </div>
      )}
      {message && (
        <div className="text-sm font-medium text-gray-700">{message}</div>
      )}
    </div>
  );
}