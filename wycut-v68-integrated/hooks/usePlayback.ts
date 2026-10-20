'use client';
import { useCallback, useState } from 'react';
export function usePlayback(){const [playing,setPlaying]=useState(false);const toggle=useCallback((video:HTMLVideoElement|null)=>{if(!video)return;if(video.paused)void video.play().catch(()=>undefined);else video.pause();},[]);return {playing,setPlaying,toggle};}
