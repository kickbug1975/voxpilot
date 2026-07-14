import { z } from 'zod';

export const VoiceCrmDataSchema = z.object({
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  title: z.string(),
  content: z.string().nullable(),
  dueDate: z.string().nullable(),
  taskType: z.enum(['call', 'email', 'visit', 'meeting', 'quote', 'quote_follow_up', 'other']),
  direction: z.enum(['inbound', 'outbound']).nullable().catch(null),
});

export const VoiceCrmResultSchema = z.object({
  action: z.enum(['create_task', 'create_activity', 'unknown']),
  transcript: z.string(),
  confidence: z.number(),
  data: VoiceCrmDataSchema,
});

export type VoiceCrmResult = z.infer<typeof VoiceCrmResultSchema>;

interface AllowedCustomer {
  id: string;
  legal_name: string;
}

// Patterns typical of prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore(r)?\s+(les|l'|toutes|les\s+instructions|les\s+règles|le\s+système|previous|all)/i,
  /oublie(r)?\s+(les|l'|toutes|les\s+instructions|les\s+règles|le\s+système|previous|all)/i,
  /override\s+(instructions|prompt|rules|system)/i,
  /system\s+(prompt|instructions|rules)/i,
  /instructions\s+système/i,
  /tu\s+es\s+maintenant/i,
  /you\s+are\s+now/i,
  /nouveau\s+rôle/i,
  /new\s+role/i,
  /delete\s+all/i,
  /supprime(r)?\s+tout/i
];

export function validateVoiceResult(
  rawJson: any,
  allowedCustomers: AllowedCustomer[],
  currentDateStr: string
): VoiceCrmResult {
  const fallback = (transcript = '', confidence = 0, title = 'Action inconnue ou extraction invalide'): VoiceCrmResult => ({
    action: 'unknown',
    transcript,
    confidence,
    data: {
      customerId: null,
      customerName: null,
      title,
      content: null,
      dueDate: null,
      taskType: 'other',
      direction: null,
    },
  });

  if (!rawJson || typeof rawJson !== 'object') {
    return fallback();
  }

  // Parse the raw JSON using Zod
  const parseResult = VoiceCrmResultSchema.safeParse(rawJson);
  if (!parseResult.success) {
    console.warn('[VOICE VALIDATOR] Zod parsing failed:', parseResult.error.message);
    const rawTranscript = typeof rawJson.transcript === 'string' ? rawJson.transcript : '';
    const rawConfidence = typeof rawJson.confidence === 'number' ? rawJson.confidence : 0;
    return fallback(rawTranscript, rawConfidence);
  }

  const result = parseResult.data;

  // 1. Prompt injection pattern detection in transcription text
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(result.transcript)) {
      console.warn('[VOICE VALIDATOR] Suspected prompt injection detected in transcript:', result.transcript);
      return fallback(result.transcript, result.confidence, 'Tentative d\'injection de prompt détectée');
    }
  }

  // 2. Validate customer mapping boundaries
  if (result.data.customerId) {
    const matchedCustomer = allowedCustomers.find(c => c.id === result.data.customerId);
    if (!matchedCustomer) {
      console.warn(`[VOICE VALIDATOR] Customer ID "${result.data.customerId}" is not in the organization's customer list.`);
      result.data.customerId = null;
      result.data.customerName = null;
    } else {
      // Ensure the official legal name matches what's stored
      result.data.customerName = matchedCustomer.legal_name;
    }
  } else {
    result.data.customerId = null;
    result.data.customerName = null;
  }

  // 3. Safety checks for date calculation
  if (result.data.dueDate) {
    const dueTime = Date.parse(result.data.dueDate);
    const currentTime = Date.parse(currentDateStr);

    if (isNaN(dueTime) || isNaN(currentTime)) {
      console.warn('[VOICE VALIDATOR] Invalid date parsing:', result.data.dueDate, currentDateStr);
      result.data.dueDate = null;
      if (result.action === 'create_task') {
        result.action = 'unknown';
      }
    } else {
      const diffMs = dueTime - currentTime;
      const oneDayMs = 24 * 60 * 60 * 1000;
      const oneYearMs = 365 * oneDayMs;

      // Unreasonable past (more than 24 hours ago) or future (more than 2 years from now)
      if (diffMs < -oneDayMs || diffMs > 2 * oneYearMs) {
        console.warn(`[VOICE VALIDATOR] Date range violation: dueDate="${result.data.dueDate}" relative to currentDate="${currentDateStr}"`);
        result.data.dueDate = null;
        if (result.action === 'create_task') {
          result.action = 'unknown';
        }
      }
    }
  } else if (result.action === 'create_task') {
    // A task requires a due date; if none was set/valid, mark as unknown
    console.warn('[VOICE VALIDATOR] task action missing dueDate');
    result.action = 'unknown';
  }

  return result;
}
