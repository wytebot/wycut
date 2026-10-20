'use client';
import { useCallback, useState } from 'react';
export function useTimeline(initialDuration=0){const [playhead,setPlayhead]=useState(0);const [zoom,setZoom]=useState(1);const [selectedTrack,setSelectedTrack]=useState<'video'|'audio'|'text'|'overlay'>('video');const scrub=useCallback((seconds:number)=>setPlayhead(Math.max(0,Math.min(initialDuration||Number.MAX_SAFE_INTEGER,seconds))),[initialDuration]);return {playhead,zoom,selectedTrack,setPlayhead:scrub,setZoom,setSelectedTrack};}
