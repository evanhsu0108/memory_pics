/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Film, 
  Loader2, 
  Play, 
  Trash2, 
  Sparkles,
  ChevronRight,
  AlertCircle,
  Download,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";

// Types
interface UploadedImage {
  id: string;
  url: string;
  base64: string;
  file: File;
}

interface VideoGenerationState {
  status: 'idle' | 'preparing' | 'generating_video' | 'generating_music' | 'completed' | 'error';
  progress: number;
  videoUrl?: string;
  videoUrls?: string[];
  audioUrl?: string;
  error?: string;
  message?: string;
}

// Reassuring messages for long generation
const LOADING_MESSAGES = [
  "正在分析您的照片故事...",
  "正在構思最適合的回憶風格...",
  "AI 正在編織您的影像回憶...",
  "正在渲染高品質動畫...",
  "正在延長影片長度，捕捉更多細節...",
  "正在為您的回憶添加魔法感...",
  "正在創作專屬的背景音樂...",
  "最後的潤色中..."
];

export default function App() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [videoState, setVideoState] = useState<VideoGenerationState>({ status: 'idle', progress: 0 });
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [messageIndex, setMessageIndex] = useState(0);

  // Sync audio and video
  useEffect(() => {
    if (videoState.status === 'completed' && videoRef.current && audioRef.current) {
      const video = videoRef.current;
      const audio = audioRef.current;

      const handlePlay = () => audio.play();
      const handlePause = () => audio.pause();
      const handleSeek = () => { audio.currentTime = video.currentTime; };

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('seeking', handleSeek);

      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('seeking', handleSeek);
      };
    }
  }, [videoState.status, videoState.videoUrl, videoState.audioUrl]);

  // Check for API key on mount
  useEffect(() => {
    const checkKey = async () => {
      // 1. Check URL for "?key=xxxx"
      const urlParams = new URLSearchParams(window.location.search);
      const keyFromUrl = urlParams.get('key');
      
      if (keyFromUrl) {
        sessionStorage.setItem("GEMINI_API_KEY_RUNTIME", keyFromUrl);
        // Clean URL to not expose it in the screen recording/share
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        setHasApiKey(true);
        return;
      }

      // @ts-ignore - window.aistudio is injected
      if (window.aistudio?.hasSelectedApiKey) {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else if (process.env.GEMINI_API_KEY || sessionStorage.getItem("GEMINI_API_KEY_RUNTIME")) {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  // Rotate loading messages
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (videoState.status !== 'idle' && videoState.status !== 'completed' && videoState.status !== 'error') {
      interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [videoState.status]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (images.length + files.length > 3) {
      alert("最多只能上傳 3 張照片喔！");
      return;
    }

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setImages(prev => [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            url: URL.createObjectURL(file as any),
            base64,
            file
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const openSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio?.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    } else {
      const key = window.prompt("請輸入您的 Gemini API 金鑰：");
      if (key) {
        sessionStorage.setItem("GEMINI_API_KEY_RUNTIME", key);
        setHasApiKey(true);
      }
    }
  };

  const generateVideo = async () => {
    if (images.length === 0) return;
    
    if (!hasApiKey) {
      await openSelectKey();
      return;
    }

    setVideoState({ status: 'preparing', progress: 0, message: "準備中..." });

    try {
      const apiKey = sessionStorage.getItem("GEMINI_API_KEY_RUNTIME") || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      
      // 1. Video Generation (5s)
      setVideoState({ status: 'generating_video', progress: 10, message: "正在生成影像..." });
      
      let generatedUris: string[] = [];
      const segments: { startIdx: number, endIdx: number }[] = [];
      
      if (images.length === 3) {
         segments.push({ startIdx: 0, endIdx: 1 });
         segments.push({ startIdx: 1, endIdx: 2 });
      } else if (images.length > 0) {
         segments.push({ startIdx: 0, endIdx: images.length - 1 });
      }

      // Loop through segments to generate multiple videos if necessary
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        
        if (segments.length > 1) {
           setVideoState(prev => ({ ...prev, status: 'generating_video', progress: prev.progress + 2, message: `正在生成第 ${i+1}/${segments.length} 段動態影像 (需時較長)...` }));
        }

        let currentPrompt = "A cinematic, high-quality memory video strictly based on the provided reference image. Gently and naturally animate the subjects, people, and landscapes in the photo while perfectly preserving the original visual style and identity.";
        
        if (images.length === 2) {
           currentPrompt = "A cinematic, high-quality memory video that smoothly transitions between the two provided reference images. Maintain the exact scene of the first photo for about 2 seconds, execute a seamless natural transition, and maintain the exact scene of the final photo for about 2 seconds.";
        } else if (images.length === 3) {
           currentPrompt = "A cinematic, high-quality memory video. Maintain the exact scene of the first photo for about 1.5 seconds, perform a smooth natural transition, and finally transition into the exact ending photo scene for 1.5 seconds.";
        }

        currentPrompt += " CRITICAL CONSTRAINT: You must STRICTLY limit every single frame to originate ONLY from the user-provided reference photos. You are allowed to moderately animate the existing visual elements (e.g., natural movements of people, subtle physics), but you must NEVER extrapolate, insert imaginative visual scenes, transform into unrelated dimensions, or hallucinate new objects/environments. Adhere 100% to the exact visual truth of the input photos.";

        const videoPayload: any = {
        model: 'veo-3.1-lite-generate-preview',
        prompt,
        image: {
          imageBytes: images[0].base64,
          mimeType: images[0].file.type,
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9',
          personGeneration: 'ALLOW_ADULT',
          safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" }
          ]
        }
        };

        if (seg.startIdx !== seg.endIdx) {
          videoPayload.config.lastFrame = {
            imageBytes: images[seg.endIdx].base64,
            mimeType: images[seg.endIdx].file.type,
          };
        }

        let operation = await ai.models.generateVideos(videoPayload);

      const pollOperation = async (op: any, startProgress: number, endProgress: number) => {
        let currentOp = op;
        let pollCount = 0;
        
        if (!currentOp || currentOp.error) {
           throw new Error(`生成失敗: ${currentOp?.error?.message || '未知錯誤'}`);
        }

        while (!currentOp.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          try {
            const opName = currentOp.name;
            if (!opName) throw new Error("Operation 沒有回傳有效的 name");
            
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${apiKey}`);
            currentOp = await res.json();
          } catch(e: any) {
             console.error("Polling error:", e);
             throw new Error(`查詢進度失敗: ${e.message}`);
          }
          
          if (currentOp.error) throw new Error(`生成失敗: ${currentOp.error.message}`);
          pollCount++;
          const progress = Math.min(startProgress + (pollCount * 2), endProgress);
          setVideoState(prev => ({ ...prev, progress, message: LOADING_MESSAGES[messageIndex] }));
        }
        return currentOp;
      };

        const startProg = 10 + (i * 30);
        const endProg = startProg + 30;
        operation = await pollOperation(operation, startProg, endProg);
        
        if (operation.error) throw new Error(`一段影片生成失敗: ${operation.error.message}`);
        
        let finalVideoData = operation.response?.generatedVideos?.[0]?.video || operation.response?.generatedVideos?.[0];
      
        // Fallback for REST API structure
        if (!finalVideoData && (operation.response as any)?.generateVideoResponse?.generatedSamples) {
           finalVideoData = (operation.response as any).generateVideoResponse.generatedSamples[0]?.video;
        }
        
        const filteredReasons = (operation.response as any)?.generateVideoResponse?.raiMediaFilteredReasons;
        if (filteredReasons && filteredReasons.length > 0) {
           let reason = filteredReasons[0];
           if (reason.includes("photorealistic children")) {
              reason = "Google 官方模型存在硬性限制，為了防止濫用，嚴格禁止生成任何包含「真實兒童臉孔」的影片，這是無法繞過的政策。請更換為成人或是純風景的照片再試一次。";
           }
           throw new Error(`Google AI 安全攔截: ${reason}`);
        }
        
        const downloadLink = (finalVideoData as any)?.uri;
        if (!downloadLink) {
          console.error("Operation data:", operation);
          throw new Error(`未能獲取影片連結，原始回應: ${JSON.stringify(operation.response || operation)}`);
        }

        const videoResponse = await fetch(downloadLink, {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
        });
        const videoBlob = await videoResponse.blob();
        generatedUris.push(URL.createObjectURL(videoBlob));
      }

      // 2. Generate Music (30s)
      setVideoState({ status: 'generating_music', progress: 80, message: "正在創作背景音樂..." });
      const musicStream = await ai.models.generateContentStream({
        model: "lyria-3-clip-preview",
        contents: "Cinematic, nostalgic, emotional orchestral background music for a memory video. No vocals.",
      });

      let audioBase64 = "";
      for await (const chunk of musicStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData?.data) audioBase64 += part.inlineData.data;
          }
        }
      }

      const audioBinary = atob(audioBase64);
      const audioBytes = new Uint8Array(audioBinary.length);
      for (let i = 0; i < audioBinary.length; i++) audioBytes[i] = audioBinary.charCodeAt(i);
      const audioBlob = new Blob([audioBytes], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);

      setVideoState({ status: 'completed', progress: 100, videoUrl: generatedUris[0], videoUrls: generatedUris, audioUrl });
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || "製作過程中發生錯誤，請稍後再試。";
      
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "API 額度已耗盡 (Quota Exceeded)。請確認您的 Google Cloud 專案已啟用計費功能，或嘗試更換其他 API 金鑰。";
      }

      setVideoState({ 
        status: 'error', 
        progress: 0, 
        error: errorMessage
      });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-amber-100">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="space-y-2 text-center md:text-left">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center md:justify-start gap-2 text-amber-600 font-medium tracking-wide uppercase text-sm"
          >
            <Sparkles className="w-4 h-4" />
            AI 影像工坊 Pro
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900"
          >
            回憶影像
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-neutral-500 text-lg max-w-md"
          >
            將珍貴的照片編織成約 5 秒的感性短片，並配上 AI 創作的專屬音樂。包含人物或風景的照片皆可。
          </motion.p>
        </div>

        {!hasApiKey && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openSelectKey}
            className="flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-full font-medium shadow-lg hover:bg-neutral-800 transition-colors"
          >
            <Key className="w-4 h-4" />
            設定 API 金鑰以開始
          </motion.button>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Upload & Preview */}
        <div className="lg:col-span-7 space-y-8">
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-amber-500" />
                上傳回憶照片 ({images.length}/3)
              </h2>
              {images.length > 0 && (
                <button 
                  onClick={() => setImages([])}
                  className="text-sm text-neutral-400 hover:text-red-500 transition-colors"
                >
                  清空全部
                </button>
              )}
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative group cursor-pointer border-2 border-dashed rounded-2xl p-12
                flex flex-col items-center justify-center gap-4 transition-all
                ${images.length >= 3 ? 'opacity-50 pointer-events-none' : 'hover:border-amber-300 hover:bg-amber-50/30'}
                border-neutral-200
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple 
                accept="image/*"
                className="hidden"
              />
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-neutral-400 group-hover:text-amber-500" />
              </div>
              <div className="text-center">
                <p className="font-medium text-neutral-700">點擊或拖拽照片至此</p>
                <p className="text-sm text-neutral-400 mt-1">支援 JPG, PNG 格式，最多 3 張</p>
              </div>
            </div>

            {/* Image Grid */}
            <AnimatePresence>
              {images.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-3 sm:grid-cols-5 gap-4 mt-8"
                >
                  {images.map((img, idx) => (
                    <motion.div 
                      key={img.id}
                      layout
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="relative aspect-square group"
                    >
                      <img 
                        src={img.url} 
                        alt={`Upload ${idx}`}
                        className="w-full h-full object-cover rounded-xl shadow-sm border border-neutral-100"
                        referrerPolicy="no-referrer"
                      />
                      <button 
                        onClick={() => removeImage(img.id)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Tips Section */}
          <div className="bg-amber-50/50 rounded-2xl p-6 border border-amber-100 flex gap-4">
            <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Pro 製作小撇步：</p>
              <ul className="list-disc list-inside space-y-1 opacity-80">
                <li>我們將使用 Veo Lite 模型，完美呈現照片細節（支援風景與人物，非公眾人物）。</li>
                <li>影片長度約 5 秒，並配上 AI 原創音樂。</li>
                <li>此過程包含影像生成與音樂創作，約需 1 分鐘。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Column: Generation & Result */}
        <div className="lg:col-span-5 space-y-8">
          <section className="bg-neutral-900 rounded-3xl p-8 text-white shadow-xl min-h-[400px] flex flex-col">
            <div className="flex items-center gap-2 mb-8">
              <Film className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-semibold">生成預覽</h2>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center">
              {videoState.status === 'idle' && (
                <div className="space-y-6">
                  <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto">
                    <Play className="w-8 h-8 text-neutral-600" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-neutral-400">上傳照片後點擊下方按鈕開始製作</p>
                  </div>
                  <button 
                    disabled={images.length === 0}
                    onClick={generateVideo}
                    className={`
                      w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all
                      ${images.length > 0 
                        ? 'bg-amber-500 hover:bg-amber-400 text-neutral-900 shadow-lg shadow-amber-500/20' 
                        : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'}
                    `}
                  >
                    製作 5s 音樂影片
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              {videoState.status !== 'idle' && videoState.status !== 'completed' && videoState.status !== 'error' && (
                <div className="space-y-8 w-full max-w-xs">
                  <div className="relative w-32 h-32 mx-auto">
                    <Loader2 className="w-full h-full text-amber-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-amber-500">
                      {videoState.progress}%
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xl font-medium text-white">{videoState.message}</p>
                    <p className="text-neutral-500 text-sm">正在執行多階段生成，請耐心等候</p>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-amber-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${videoState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {videoState.status === 'completed' && videoState.videoUrls && (
                <div className="w-full space-y-6">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-neutral-800"
                  >
                    {videoState.videoUrls.map((url, idx) => (
                      <video 
                        key={idx}
                        id={`vid-${idx}`}
                        src={url} 
                        style={{ opacity: idx === 0 ? 1 : 0, display: idx === 0 ? 'block' : 'none' }}
                        playsInline
                        className="absolute inset-0 w-full h-full"
                        autoPlay={idx === 0}
                        muted={true}
                        onPlay={(e) => {
                           // Accelerate to 2x if we sequence 2 videos to fit in 5s
                           if (videoState.videoUrls!.length === 2) {
                              e.currentTarget.playbackRate = 2.0;
                           }
                        }}
                        onEnded={(e) => {
                           const vids = videoState.videoUrls!;
                           const nextIdx = (idx + 1) % vids.length;
                           const nextVid = document.getElementById(`vid-${nextIdx}`) as HTMLVideoElement;
                           const targetOpacityObj = (e.currentTarget as HTMLElement).style;
                           targetOpacityObj.display = 'none';
                           targetOpacityObj.opacity = '0';
                           
                           if (nextVid) {
                              nextVid.style.display = 'block';
                              nextVid.style.opacity = '1';
                              nextVid.currentTime = 0;
                              if (vids.length === 2) {
                                  nextVid.playbackRate = 2.0;
                              }
                              nextVid.play().catch(console.error);
                           }
                           
                           if (nextIdx === 0 && audioRef.current) {
                              audioRef.current.currentTime = 0;
                              audioRef.current.play();
                           }
                        }}
                      />
                    ))}
                    
                    {videoState.audioUrl && (
                      <audio ref={audioRef} autoPlay src={videoState.audioUrl} loop className="hidden" />
                    )}
                  </motion.div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setVideoState({ status: 'idle', progress: 0 })}
                      className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-medium transition-colors"
                    >
                      重新製作
                    </button>
                    <a 
                      href={videoState.videoUrl} 
                      download="memory-video.mp4"
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-neutral-900 rounded-xl font-bold transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      下載影片
                    </a>
                  </div>
                </div>
              )}

              {videoState.status === 'error' && (
                <div className="space-y-6 max-w-xs">
                  <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-red-400 font-medium">發生錯誤</p>
                    <p className="text-neutral-500 text-sm">{videoState.error}</p>
                  </div>
                  <div className="space-y-3">
                    <button 
                      onClick={() => setVideoState({ status: 'idle', progress: 0 })}
                      className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-medium transition-colors"
                    >
                      返回重試
                    </button>
                    {videoState.error?.includes("額度已耗盡") && (
                      <button 
                        onClick={openSelectKey}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-900 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                      >
                        <Key className="w-4 h-4" />
                        重新設定 API 金鑰
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Billing Info for Veo */}
          <p className="text-center text-xs text-neutral-400">
            影像生成由 Google Veo 提供，音樂由 Lyria 提供。
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-amber-500 ml-1"
            >
              瞭解計費詳情
            </a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-neutral-100 text-center text-neutral-400 text-sm">
        <p>© 2026 回憶影像 Pro. 讓每一刻都成為永恆。</p>
      </footer>
    </div>
  );
}
