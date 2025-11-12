import { useEffect, useState } from 'react';

interface FileObject {
  key: string;
  size: number;
  uploaded: string;
  downloadUrl?: string;
}

export function FileList() {
  const [files, setFiles] = useState<FileObject[]>([]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/list-files');
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  const handleDownload = async (key: string) => {
    try {
      const response = await fetch(`/api/download/${encodeURIComponent(key)}`);
      if (!response.ok) {
        throw new Error('Download failed');
      }

      // Get the filename from the Content-Disposition header if available
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : key;

      // Create a ReadableStream from the response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to initialize download stream');
      }

      // Create a new ReadableStream and pipe it to a blob
      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const {done, value} = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } finally {
            reader.releaseLock();
            controller.close();
          }
        }
      });

      // Create response from stream and convert to blob
      const newResponse = new Response(stream);
      const blob = await newResponse.blob();

      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Uploaded Files</h2>
      <div className="space-y-2">
        {files.map((file) => (
          <div key={file.key} className="flex justify-between items-center p-3 bg-gray-50 rounded">
            <span className="font-medium">{file.key}</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {Math.round(file.size / 1024 / 1024)}MB
              </span>
              <button
                onClick={() => handleDownload(file.key)}
                className="px-3 py-1 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}