import { useState } from 'react';
import { FileUploader } from './components/FileUploader';
import { FileList } from './components/FileList';

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadComplete = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Large File Upload</h1>
      <FileUploader onUploadComplete={handleUploadComplete} />
      <FileList key={refreshTrigger} />
    </div>
  );
}