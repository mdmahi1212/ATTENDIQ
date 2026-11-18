/** Versioned biometric consent text. Changing the text = new version = students consent again. */
export const CONSENT_VERSION = "2026-11-v1";

export const CONSENT_TEXT = {
  title: "Consent to biometric processing (face)",
  paragraphs: [
    "Purpose: your face is used only to mark your attendance in the classes you are enrolled in (door camera) and to confirm it is you when the app asks you to verify on your phone.",
    "What is stored: numeric face templates (512 numbers per photo) computed from about 10 photos taken now. The photos themselves are not kept. If our system flags a possible duplicate account, one small thumbnail is kept for an administrator to review and is deleted after the decision.",
    "Where: in the university attendance database (Supabase, access-controlled). Video from classroom cameras never leaves the classroom; only events (who entered, when) are sent.",
    "How long: until you graduate or withdraw consent. You can withdraw at any time in the app; your face templates are then deleted and you use QR + professor confirmation instead.",
    "This is sensitive information under Korea's Personal Information Protection Act (PIPA). Consent is separate and voluntary: refusing does not affect your grades; you will use the non-biometric check-in path.",
  ],
} as const;
