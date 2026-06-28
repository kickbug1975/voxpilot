'use client';

import React, { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Mic, X, Clock, User, Check, Loader2, 
  Trash2, AlertCircle, FileText, Calendar, Sparkles
} from 'lucide-react';
import { createTask } from '@/actions/tasks';
import { createActivity } from '@/actions/activities';

interface VoiceAssistantWidgetProps {
  orgSlug: string;
}

interface ExtractedData {
  action: 'create_task' | 'create_activity' | 'unknown';
  transcript: string;
  confidence: number;
  data: {
    customerId: string | null;
    customerName: string | null;
    title: string;
    content: string | null;
    dueDate: string | null;
    taskType: 'call' | 'email' | 'visit' | 'meeting' | 'quote' | 'quote_follow_up' | 'other';
    direction: 'inbound' | 'outbound' | null;
  };
}

export default function VoiceAssistantWidget({ orgSlug }: VoiceAssistantWidgetProps) {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isActionPending, startActionTransition] = useTransition();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Start recording audio
  const startRecording = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setExtracted(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Error starting audio recording:', err);
      setErrorMsg("Impossible d'accéder au micro. Veuillez vérifier vos autorisations.");
    }
  };

  // Stop recording audio
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stop all tracks to release microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  // Send audio to API route for processing
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('orgSlug', orgSlug);

    try {
      const res = await fetch('/api/voice/process', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Erreur lors du traitement de la voix.");
      }

      const result: ExtractedData = await res.json();
      
      if (result.action === 'unknown') {
        throw new Error("L'assistant n'a pas pu identifier d'action CRM dans votre message vocal.");
      }

      setExtracted(result);
    } catch (err: any) {
      console.error('Error processing voice audio:', err);
      setErrorMsg(err.message || "Une erreur est survenue lors de l'analyse vocale.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm and save extracted action to CRM
  const handleConfirmAction = () => {
    if (!extracted) return;

    startActionTransition(async () => {
      try {
        const actionData = extracted.data;
        const formData = new FormData();

        if (extracted.action === 'create_task') {
          formData.append('title', actionData.title);
          if (actionData.customerId) formData.append('customerId', actionData.customerId);
          if (actionData.content) formData.append('description', actionData.content);
          formData.append('taskType', actionData.taskType);
          if (actionData.dueDate) formData.append('dueAt', actionData.dueDate);
          formData.append('priority', 'normal');

          const res = await createTask(orgSlug, formData);
          if (res.error) throw new Error(res.error);
          
          setSuccessMsg("Tâche créée avec succès !");
        } else if (extracted.action === 'create_activity') {
          if (actionData.customerId) formData.append('customerId', actionData.customerId);
          formData.append('activityType', actionData.taskType);
          formData.append('direction', actionData.direction || 'outbound');
          formData.append('subject', actionData.title);
          if (actionData.content) formData.append('content', actionData.content);
          formData.append('occurredAt', new Date().toISOString());

          const res = await createActivity(orgSlug, formData);
          if (res.error) throw new Error(res.error);

          setSuccessMsg("Activité enregistrée avec succès !");
        }

        // Reset widget after success
        setTimeout(() => {
          setExtracted(null);
          setSuccessMsg(null);
          router.refresh();
        }, 1500);

      } catch (err: any) {
        console.error('Error saving voice action:', err);
        setErrorMsg(err.message || "Impossible d'enregistrer l'action.");
      }
    });
  };

  const getActionLabel = (action: ExtractedData['action']) => {
    switch (action) {
      case 'create_task': return "Création d'une tâche";
      case 'create_activity': return "Enregistrement d'activité";
      default: return "Inconnu";
    }
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'call': return "📞";
      case 'email': return "✉️";
      case 'visit': return "🚗";
      case 'meeting': return "🤝";
      case 'quote': return "📄";
      case 'quote_follow_up': return "🔄";
      default: return "📝";
    }
  };

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('fr-BE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-[99] flex flex-col items-end gap-3 font-sans">
      {/* EXPANDED INTERACTIVE PANEL */}
      {(isRecording || isProcessing || extracted || errorMsg || successMsg) && (
        <Card className="w-80 bg-white/95 backdrop-blur-md border-slate-200 shadow-2xl rounded-2xl p-4 space-y-3 transition-all duration-300 animate-in slide-in-from-bottom-5">
          
          {/* HEADER */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              Assistant Vocal VoxPilot
            </h4>
            <button 
              onClick={() => {
                stopRecording();
                setIsRecording(false);
                setIsProcessing(false);
                setExtracted(null);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* RECORDING STATE */}
          {isRecording && (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <div className="relative flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-red-400 opacity-75"></span>
                <div className="relative rounded-full bg-red-500 p-4 text-white">
                  <Mic className="h-6 w-6 animate-pulse" />
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-600">Enregistrement en cours...</p>
              <Button 
                onClick={stopRecording} 
                variant="destructive" 
                size="sm" 
                className="text-xs font-bold px-4"
              >
                Terminer
              </Button>
            </div>
          )}

          {/* PROCESSING STATE */}
          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Transcription & Analyse par l'IA...</p>
            </div>
          )}

          {/* SUCCESS STATE */}
          {successMsg && (
            <div className="flex flex-col items-center justify-center py-8 space-y-2 text-emerald-600">
              <div className="rounded-full bg-emerald-100 p-3">
                <Check className="h-8 w-8" />
              </div>
              <p className="text-xs font-bold text-emerald-800">{successMsg}</p>
            </div>
          )}

          {/* ERROR STATE */}
          {errorMsg && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold leading-relaxed">{errorMsg}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    setErrorMsg(null);
                    setExtracted(null);
                  }}
                  className="text-xs font-bold border-slate-200"
                >
                  Fermer
                </Button>
                <Button 
                  size="sm" 
                  onClick={startRecording}
                  className="text-xs font-bold bg-primary"
                >
                  Réessayer
                </Button>
              </div>
            </div>
          )}

          {/* EXTRACTED PREVIEW STATE */}
          {extracted && !isActionPending && !successMsg && (
            <div className="space-y-3 animate-in fade-in-50">
              {/* TRANSCRIPT */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-24 overflow-y-auto">
                <p className="text-xs font-semibold italic text-slate-500 leading-relaxed">
                  "{extracted.transcript}"
                </p>
              </div>

              {/* CRM ACTION CARD */}
              <div className="bg-primary/5 rounded-xl border border-primary/10 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-primary">
                    {getActionLabel(extracted.action)}
                  </span>
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    Score: {Math.round(extracted.confidence * 100)}%
                  </Badge>
                </div>

                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="text-sm">{getTaskTypeIcon(extracted.data.taskType)}</span>
                  {extracted.data.title}
                </div>

                {extracted.data.customerName && (
                  <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    Client : <span className="font-bold text-slate-700">{extracted.data.customerName}</span>
                  </div>
                )}

                {extracted.data.dueDate && (
                  <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    Échéance : <span className="font-bold text-slate-700">{formatDueDate(extracted.data.dueDate)}</span>
                  </div>
                )}

                {extracted.data.content && (
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-1.5 mt-1 leading-relaxed">
                    {extracted.data.content}
                  </div>
                )}
              </div>

              {/* BUTTONS */}
              <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => setExtracted(null)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Effacer
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleConfirmAction}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Confirmer
                </Button>
              </div>
            </div>
          )}

          {/* ACTION PENDING STATE */}
          {isActionPending && (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Enregistrement dans la base de données...</p>
            </div>
          )}
        </Card>
      )}

      {/* FLOATING ACTION BUTTON */}
      {!isRecording && !isProcessing && !extracted && !errorMsg && !successMsg && (
        <Button
          onClick={startRecording}
          size="icon"
          className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90 text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer"
        >
          <Mic className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
