import { NextRequest, NextResponse } from 'next/server';
import { isAllowedApiOrigin } from '@/lib/server/origin';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Deliberately does not call a third-party background-removal service or charge credits.
 * Gemini can analyze video, but its standard multimodal API does not return per-pixel masks
 * or a transparent video. Enabling this endpoint requires a real segmentation/matting pipeline
 * that uses an already approved provider or local processing, not a new background-removal vendor.
 */
export async function POST(req: NextRequest) {
  if (!isAllowedApiOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({
    code: 'BACKGROUND_SEGMENTATION_NOT_IMPLEMENTED',
    error: 'AI background removal is not ready yet. Gemini can analyze the video, but this app still needs a frame-mask/segmentation renderer to create a transparent result. No credits were charged. Use Manual Mask or Chroma Key for now.',
    creditsCharged: 0,
  }, { status: 501, headers: { 'Cache-Control': 'no-store' } });
}
