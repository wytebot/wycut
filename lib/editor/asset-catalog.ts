// Asset catalog shared by the editor tool panels. Premium membership is decided server-side (config/credit-pricing.json).
export const EMOJIS=['🔥','❤️','😭','😱','😂','💔','✨','⚡','👀','😈','🐺','🐈','🌧️','💥','🎬','⭐','💯','🫶','👑','💫','🦋','🌈','☠️','🚨','🎉','💎','🥶','🤯','💘','🖤','🌟','📍'];
export const FILTERS:Record<string,string>={
 Original:'none',Cinematic:'contrast(1.16) saturate(.88) brightness(.94)',Vivid:'saturate(1.55) contrast(1.08)',Monochrome:'grayscale(1) contrast(1.12)',Warm:'sepia(.24) saturate(1.2) brightness(1.04)',Cool:'saturate(.86) hue-rotate(12deg) brightness(1.04)',Vintage:'sepia(.38) contrast(.92) saturate(.78)',Dream:'brightness(1.1) saturate(1.12) blur(.25px)',Dramatic:'contrast(1.35) saturate(1.18) brightness(.88)',Fade:'contrast(.86) saturate(.72) brightness(1.08)',Noir:'grayscale(1) contrast(1.45) brightness(.78)',Golden:'sepia(.28) saturate(1.45) contrast(1.05)',Arctic:'hue-rotate(28deg) saturate(.78) brightness(1.08)',Rose:'hue-rotate(-18deg) saturate(1.2)',TealOrange:'contrast(1.18) saturate(1.25) hue-rotate(-8deg)',Pastel:'saturate(.72) brightness(1.12) contrast(.9)',Bleach:'saturate(.25) contrast(1.4)',Matte:'contrast(.86) saturate(.82) brightness(1.06)',Sunset:'sepia(.18) saturate(1.55) hue-rotate(-8deg)',Forest:'hue-rotate(20deg) saturate(1.25)',Ocean:'hue-rotate(35deg) saturate(1.12)',Lavender:'hue-rotate(45deg) saturate(.92)',Amber:'sepia(.35) saturate(1.35)',Ice:'hue-rotate(155deg) saturate(.7) brightness(1.08)',Neon:'saturate(2) contrast(1.35)',SoftFocus:'blur(.35px) brightness(1.06) saturate(.9)',Bleak:'saturate(.55) brightness(.86) contrast(1.18)',Bright:'brightness(1.18) saturate(1.08)',Punch:'contrast(1.3) saturate(1.35)',Retro:'sepia(.2) contrast(1.08) saturate(.85)',Silver:'grayscale(1) brightness(1.12) contrast(.9)',Cobalt:'hue-rotate(190deg) saturate(1.3)',Crimson:'hue-rotate(-35deg) saturate(1.35)',Mint:'hue-rotate(75deg) saturate(.8)',Lemon:'sepia(.2) hue-rotate(350deg) saturate(1.5)',Midnight:'brightness(.7) saturate(1.2) hue-rotate(15deg)',Daylight:'brightness(1.12) saturate(1.08)',Cloudy:'contrast(.9) saturate(.8)',Polaroid:'sepia(.12) contrast(.95) saturate(.8)',BleachedFilm:'contrast(1.2) saturate(.55) brightness(1.08)',CinemaBlue:'hue-rotate(170deg) saturate(.8) contrast(1.12)',Candy:'saturate(1.6) hue-rotate(-12deg)',Moody:'brightness(.82) contrast(1.2) saturate(.85)',Autumn:'sepia(.22) hue-rotate(-15deg) saturate(1.25)',Spring:'hue-rotate(25deg) saturate(1.1) brightness(1.06)',Lofi:'sepia(.12) saturate(.7) contrast(.9)',Clean:'contrast(1.04) saturate(1.04)',SkinTone:'saturate(1.08) hue-rotate(-4deg)'};
export const FILTER_CATEGORIES: Record<string, string[]> = {
  All: Object.keys(FILTERS),
  Trending: ['Cinematic','Vivid','TealOrange','Neon','Punch','Clean','SkinTone','Golden','Moody','Dream'],
  Cinematic: ['Cinematic','Dramatic','Noir','CinemaBlue','TealOrange','Bleach','Matte','BleachedFilm','Fade','Silver'],
  Mood: ['Moody','Dream','DreamPop','Pastel','Bleak','Lavender','Rose','Lofi','Fade','SoftFocus'],
  Warm: ['Warm','Golden','Sunset','Amber','Autumn','Rose','Lemon','Polaroid','Vintage','Retro'],
  Cool: ['Cool','Arctic','Ice','Ocean','Cobalt','Mint','Forest','Spring','CinemaBlue','Midnight'],
  Retro: ['Vintage','Retro','Polaroid','Lofi','BleachedFilm','Silver','Matte','Fade','Cloudy','Bleach'],
  Nature: ['Forest','Ocean','Spring','Autumn','Mint','Daylight','Cloudy','Sunset','Lemon','SkinTone'],
  Party: ['Neon','Candy','Vivid','Punch','Crimson','Cobalt','Lemon','Bright','Golden','TealOrange'],
  Portrait: ['SkinTone','Clean','Warm','Rose','Pastel','SoftFocus','Daylight','Matte','Golden','Silver'],
  'B&W': ['Monochrome','Noir','Silver','Bleach','Bleak','Fade','Cloudy'],
};
export const EFFECT_CATEGORIES: Record<string, string[]> = {
  All: ['None','Glow','Blur','Sharpen','Grain','Glitch','Chromatic','Vignette','Bloom','Soft','HighContrast','LowContrast','Fisheye','Pixel','Ghost','Invert','Solarize','Posterize','Thermal','Underwater','Heatwave','LightLeak','LensFlare','MotionBlur','Shimmer','Duotone','Halftone','Edge','Dreamy','CCTV','Shake','RGBGlitch','ZoomBlur','Flash','Flicker','VHS','RetroTV','Comic','Sketch','DreamPop','NightVision','Infrared','FadeFilm','PunchZoom'],
  Trending: ['Glow','Chromatic','Glitch','LightLeak','LensFlare','PunchZoom','Shimmer','RGBGlitch','Flash','VHS'],
  Dreamy: ['Dreamy','Bloom','Soft','Ghost','Shimmer','Glow','ZoomBlur','MotionBlur'],
  Cinematic: ['Vignette','Grain','Sharpen','MotionBlur','ZoomBlur','LightLeak','LensFlare','FadeFilm','Ghost'],
  Glitch: ['Glitch','RGBGlitch','Chromatic','Pixel','Flicker','RetroTV','CCTV','VHS'],
  Party: ['Flash','Flicker','Shimmer','Glow','LensFlare','Heatwave','Solarize','Thermal'],
  Horror: ['CCTV','NightVision','Infrared','Ghost','Flicker','Glitch','Vignette','Invert','Solarize'],
  Retro: ['VHS','RetroTV','Grain','Comic','Sketch','Halftone','Edge','Pixel'],
  Color: ['Thermal','Underwater','Heatwave','Duotone','Solarize','Invert','NightVision','Infrared'],
  Motion: ['Shake','PunchZoom','ZoomBlur','MotionBlur','Flash','RGBGlitch','Flicker','Ghost'],
};
export const TRANSITION_CATEGORIES: Record<string, string[]> = {
  All: ['Cut','Fade','Dissolve','Zoom in','Zoom out','Flash','Glitch cut','Light leak','Whip pan','Film burn','Blur','Zoom blur','Spin','Shake','RGB split','Color flash','White flash','Fade to black'], Basic: ['Cut','Fade','Dissolve','Fade to black'], Cinematic: ['Fade','Dissolve','Film burn','Light leak','Blur','Zoom blur'], Motion: ['Zoom in','Zoom out','Whip pan','Spin','Shake'], Energetic: ['Flash','White flash','Color flash','Glitch cut','RGB split','Whip pan'], Retro: ['Film burn','Light leak','Glitch cut','RGB split'],
};
export const EFFECTS:Record<string,string>={None:'none',Glow:'brightness(1.08) saturate(1.2)',Blur:'blur(1.2px)',Sharpen:'contrast(1.22) saturate(1.08)',Grain:'contrast(1.12) saturate(.88)',Glitch:'hue-rotate(35deg) contrast(1.3)',Chromatic:'hue-rotate(8deg) saturate(1.3)',Vignette:'brightness(.88) contrast(1.12)',Bloom:'brightness(1.13) blur(.2px)',Soft:'blur(.45px)',HighContrast:'contrast(1.55)',LowContrast:'contrast(.78)',Fisheye:'saturate(1.2) contrast(1.1)',Pixel:'contrast(1.15)',Ghost:'opacity(.85) brightness(1.1)',Invert:'invert(1)',Solarize:'invert(.65) saturate(1.3)',Posterize:'contrast(1.4) saturate(1.4)',Thermal:'hue-rotate(220deg) saturate(1.8)',Underwater:'hue-rotate(40deg) saturate(.85) brightness(.92)',Heatwave:'sepia(.3) saturate(1.6)',LightLeak:'sepia(.12) brightness(1.12)',LensFlare:'brightness(1.18) contrast(1.05)',MotionBlur:'blur(.7px)',Shimmer:'saturate(1.35) brightness(1.05)',Duotone:'grayscale(.7) sepia(.25)',Halftone:'contrast(1.35) saturate(.7)',Edge:'grayscale(1) contrast(1.8)',Dreamy:'blur(.25px) brightness(1.1) saturate(1.15)',CCTV:'grayscale(1) contrast(1.5) brightness(.82)',Shake:'contrast(1.12) saturate(1.2)',RGBGlitch:'hue-rotate(25deg) contrast(1.25)',ZoomBlur:'blur(.8px) contrast(1.1)',Flash:'brightness(1.5)',Flicker:'contrast(1.2) brightness(1.08)',VHS:'saturate(.8) contrast(1.15) hue-rotate(-5deg)',RetroTV:'sepia(.15) contrast(1.3) saturate(.7)',Comic:'contrast(1.6) saturate(1.5)',Sketch:'grayscale(1) contrast(1.8)',DreamPop:'saturate(1.5) brightness(1.08) blur(.15px)',NightVision:'hue-rotate(75deg) saturate(1.7) contrast(1.2)',Infrared:'hue-rotate(260deg) saturate(1.8)',FadeFilm:'contrast(.9) saturate(.7) brightness(1.08)',PunchZoom:'contrast(1.3) saturate(1.25)'};
// Additional creator-grade presets. These are lightweight native CSS/FFmpeg-friendly presets, not remote assets.
Object.assign(FILTERS, {
  SoftPortrait:'brightness(1.06) saturate(.92) contrast(.94)', FilmWarm:'sepia(.16) saturate(1.22) contrast(1.06)', Studio:'brightness(1.04) contrast(1.08) saturate(1.03)',
  CityNight:'brightness(.78) contrast(1.28) saturate(1.35) hue-rotate(12deg)', FoodPop:'saturate(1.42) contrast(1.08) brightness(1.04)', CleanSkin:'brightness(1.03) saturate(.94) contrast(.97)',
  BlueHour:'hue-rotate(18deg) saturate(.9) brightness(.88)', DreamyRose:'sepia(.12) hue-rotate(-12deg) saturate(1.12) brightness(1.08)',
  Action:'contrast(1.35) saturate(1.25)', Documentary:'saturate(.78) contrast(1.12) brightness(.98)',
  GoldenHour:'sepia(.16) saturate(1.32) brightness(1.08)', Wedding:'brightness(1.08) saturate(.82) contrast(.94)',
  CreatorPop:'saturate(1.3) contrast(1.08)', MatteCinema:'contrast(.92) saturate(.86) brightness(1.03)',
  DeepBlack:'grayscale(1) contrast(1.65) brightness(.82)', PastelPink:'hue-rotate(-18deg) saturate(.78) brightness(1.12)',
  RetroGreen:'sepia(.16) hue-rotate(28deg) saturate(.85) contrast(1.08)', AmberNight:'sepia(.25) saturate(1.18) brightness(.88)',
  Snow:'brightness(1.18) saturate(.55) hue-rotate(165deg)', Tropical:'saturate(1.4) hue-rotate(12deg) brightness(1.04)'
});
Object.assign(EFFECTS, {
  FilmGrain:'contrast(1.12) saturate(.88)', SoftGlow:'brightness(1.1) saturate(1.1) blur(.2px)', ColorShift:'hue-rotate(28deg) saturate(1.35)',
  DreamBlur:'blur(.6px) brightness(1.08)', OldFilm:'sepia(.22) contrast(1.1) saturate(.75)', BlueFlare:'hue-rotate(170deg) brightness(1.1)',
  RedFlash:'sepia(.3) saturate(1.7) contrast(1.2)', VHSNoise:'contrast(1.2) saturate(.8) hue-rotate(-8deg)', ComicInk:'grayscale(.25) contrast(1.55) saturate(1.2)',
  FadeGlow:'brightness(1.12) contrast(.9)', ColorPop:'saturate(1.55) contrast(1.12)', SoftVignette:'brightness(.92) contrast(1.08)',
  MirrorMood:'saturate(1.15) contrast(1.12)', PastelDream:'saturate(.78) brightness(1.12) contrast(.9)', CinemaGrain:'contrast(1.16) saturate(.82) brightness(.96)',
  Prism:'hue-rotate(40deg) saturate(1.4)', FlashFrame:'brightness(1.55) contrast(1.15)', RetroGlow:'sepia(.16) brightness(1.08) saturate(1.15)',
  NightClub:'hue-rotate(250deg) saturate(1.6) contrast(1.25)', SoftFocusPlus:'blur(.7px) brightness(1.05)'
});
export const TRANSITIONS=['Cut','Fade','Dissolve','Zoom in','Zoom out','Flash','Glitch cut','Light leak','Whip pan','Film burn','Blur','Zoom blur','Spin','Shake','RGB split','Color flash','White flash','Fade to black'];
export const ANIMATIONS=['None','Fade in','Fade out','Pop','Bounce','Pulse','Typewriter','Slide up','Slide down','Slide left','Slide right','Zoom in','Zoom out','Float','Shake','Wiggle','Swing','Flip','Rubber band','Jello','Tada','Heart beat','Flash','Blur in','Rise','Drop','Spin in','Elastic','Flicker','Neon glow','Wave','Snap zoom','Camera shake','Glitch flicker','Pop in','Pop out','Zoom bounce','Micro shake','Tremble','Vibrate','Strobe','RGB split','Spin out','Flip in','Flip out','Slide and fade','Swipe reveal','Bounce up','Bounce down','Jitter','Heartbeat zoom','Flash in','Flash out','Elastic pop','Spring','Float up','Float down','Type on','Neon pulse','Blur out','Swing in','Glide','Glitch reveal','Letter by letter','Word reveal','Cursor type','Wave text','Tracking reveal','Karaoke sweep','Gradient shimmer','Outline pulse','3D flip','Arc bounce','Drift','Slam','Whip in','Whip out','Spin bounce','Pixel dissolve','Digital scan','Sparkle reveal','Stagger up','Stagger down','Stretch','Compress','Orbit','Pendulum','Glow trail','Ink reveal','Stamp','Typewriter cursor','Caption bounce','Social pop','Subscribe pulse','Like burst','Confetti rise','Party shimmer','Soft reveal','Mask wipe','Zoom blur in','Zoom blur out','Focus snap','Liquid wave','Neon flicker','Glitch type','Retro flicker','Pop shake','Slide elastic','Fade and rise','Bounce and settle','Pulse glow','3D rotate','Hologram','VHS text','Heartbeat pop','Ticker scroll','Vertical type','Underline draw','Highlight sweep','Split reveal','Magnetic pop','Drop bounce','Rubber reveal','Spark burst','Shine sweep','Fast type','Slow type','Typewriter smooth','Pop word','Sticker bounce','End card glow'];
export const STICKERS=['🔥 HOT SCENE','❤️ LOVE','💔 HEARTBREAK','😂 FUNNY','😱 TWIST','⭐ MUST WATCH','NEW','OMG!','PLOT TWIST','WAIT FOR IT','PART 1','PART 2','SHOCKING','TRUE STORY','TO BE CONTINUED','💥 BOOM','👀 LOOK','🚨 ALERT','💯 FACTS','✨ MAGIC','😭 EMOTIONAL','🏆 WINNER','💀 DEAD','🤯 MIND BLOWN','💬 SAY WHAT?','🎬 SCENE','❤️‍🔥 INTENSE','👑 LEGEND','❗ IMPORTANT','🔒 SECRET'];
export const ANIMATION_CSS:Record<string,string>={'Fade in':'wy-fade-in','Fade out':'wy-fade-out','Pop':'wy-pop','Bounce':'wy-bounce','Pulse':'wy-pulse','Typewriter':'wy-typewriter','Slide up':'wy-slide-up','Slide down':'wy-slide-down','Slide left':'wy-slide-left','Slide right':'wy-slide-right','Zoom in':'wy-zoom-in','Zoom out':'wy-zoom-out','Float':'wy-float','Shake':'wy-shake','Wiggle':'wy-wiggle','Swing':'wy-swing','Flip':'wy-flip','Rubber band':'wy-rubber','Jello':'wy-jello','Tada':'wy-tada','Heart beat':'wy-heartbeat','Flash':'wy-flash','Blur in':'wy-blur-in','Rise':'wy-rise','Drop':'wy-drop','Spin in':'wy-spin-in','Elastic':'wy-elastic','Flicker':'wy-flicker','Neon glow':'wy-neon','Wave':'wy-wave'};
Object.assign(ANIMATION_CSS, {
  'Snap zoom':'wy-zoom-in','Camera shake':'wy-shake','Glitch flicker':'wy-flicker','Pop in':'wy-pop','Pop out':'wy-zoom-out','Zoom bounce':'wy-bounce','Micro shake':'wy-shake','Tremble':'wy-shake','Vibrate':'wy-shake','Strobe':'wy-flash','RGB split':'wy-flicker','Spin out':'wy-spin-out','Flip in':'wy-flip','Flip out':'wy-flip-out','Slide and fade':'wy-slide-up','Swipe reveal':'wy-slide-left','Bounce up':'wy-bounce','Bounce down':'wy-bounce','Jitter':'wy-shake','Heartbeat zoom':'wy-heartbeat','Flash in':'wy-flash','Flash out':'wy-fade-out','Elastic pop':'wy-elastic','Spring':'wy-bounce','Float up':'wy-float','Float down':'wy-float','Type on':'wy-typewriter','Neon pulse':'wy-neon','Blur out':'wy-blur-out','Swing in':'wy-swing'
});

Object.assign(ANIMATION_CSS, {
  'Glide':'wy-glide','Glitch reveal':'wy-glitch-reveal','Letter by letter':'wy-typewriter','Word reveal':'wy-word-reveal','Cursor type':'wy-typewriter','Wave text':'wy-wave','Tracking reveal':'wy-tracking','Karaoke sweep':'wy-karaoke','Gradient shimmer':'wy-gradient-shimmer','Outline pulse':'wy-outline-pulse','3D flip':'wy-3d-flip','Arc bounce':'wy-bounce','Drift':'wy-float','Slam':'wy-slam','Whip in':'wy-whip-in','Whip out':'wy-whip-out','Spin bounce':'wy-spin-bounce','Pixel dissolve':'wy-pixel-dissolve','Digital scan':'wy-digital-scan','Sparkle reveal':'wy-sparkle','Stagger up':'wy-slide-up','Stagger down':'wy-slide-down','Stretch':'wy-stretch','Compress':'wy-compress','Orbit':'wy-orbit','Pendulum':'wy-pendulum','Glow trail':'wy-neon','Ink reveal':'wy-ink-reveal','Stamp':'wy-stamp','Typewriter cursor':'wy-typewriter','Caption bounce':'wy-bounce','Social pop':'wy-social-pop','Subscribe pulse':'wy-subscribe-pulse','Like burst':'wy-like-burst','Confetti rise':'wy-confetti','Party shimmer':'wy-gradient-shimmer','Soft reveal':'wy-soft-reveal','Mask wipe':'wy-mask-wipe','Zoom blur in':'wy-blur-in','Zoom blur out':'wy-blur-out','Focus snap':'wy-focus-snap','Liquid wave':'wy-wave','Neon flicker':'wy-neon-flicker','Glitch type':'wy-glitch-reveal','Retro flicker':'wy-flicker','Pop shake':'wy-shake','Slide elastic':'wy-elastic','Fade and rise':'wy-rise','Bounce and settle':'wy-bounce','Pulse glow':'wy-subscribe-pulse','3D rotate':'wy-3d-flip','Hologram':'wy-hologram','VHS text':'wy-effect-vhs','Heartbeat pop':'wy-heartbeat','Ticker scroll':'wy-ticker','Vertical type':'wy-vertical-type','Underline draw':'wy-underline-draw','Highlight sweep':'wy-karaoke','Split reveal':'wy-split-reveal','Magnetic pop':'wy-social-pop','Drop bounce':'wy-drop','Rubber reveal':'wy-rubber','Spark burst':'wy-sparkle','Shine sweep':'wy-gradient-shimmer','Fast type':'wy-typewriter','Slow type':'wy-typewriter','Typewriter smooth':'wy-typewriter','Pop word':'wy-word-reveal','Sticker bounce':'wy-social-pop','End card glow':'wy-gradient-shimmer','Popup bounce':'wy-social-pop'
});

/** Motion previews for visual effects (separate from text animation presets). */
export const LIVE_EFFECT_ANIMATIONS: Record<string, string> = {
  Shake: 'wy-effect-shake 360ms linear infinite', RGBGlitch: 'wy-effect-glitch 650ms steps(2,end) infinite', Glitch: 'wy-effect-glitch 650ms steps(2,end) infinite',
  Flash: 'wy-effect-flash 700ms steps(2,end) infinite', Flicker: 'wy-effect-flicker 900ms steps(3,end) infinite', Shimmer: 'wy-effect-shimmer 1.6s ease-in-out infinite',
  LensFlare: 'wy-effect-flare 2.2s ease-in-out infinite', LightLeak: 'wy-effect-leak 1.8s ease-in-out infinite', MotionBlur: 'wy-effect-motion 700ms ease-in-out infinite',
  ZoomBlur: 'wy-effect-zoom 1.2s ease-in-out infinite', PunchZoom: 'wy-effect-punch 1.1s ease-in-out infinite', Heatwave: 'wy-effect-heat 1.5s ease-in-out infinite',
  Ghost: 'wy-effect-ghost 1.3s ease-in-out infinite', NightVision: 'wy-effect-night 1.5s steps(3,end) infinite', VHS: 'wy-effect-vhs 1.1s steps(2,end) infinite',
};


export type FontChoice = { label: string; value: string };
/** `value` is what the preview and the MP4 export use as the canvas font family (must match /^[\w ,'-]{1,50}$/). */
export const FONT_CHOICES: FontChoice[] = [
  { label: 'Inter', value: 'Inter' }, { label: 'Arial', value: 'Arial' }, { label: 'Arial Black', value: 'Arial Black' }, { label: 'Impact', value: 'Impact' },
  { label: 'Roboto', value: 'Roboto' }, { label: 'Open Sans', value: 'Open Sans' }, { label: 'Montserrat', value: 'Montserrat' }, { label: 'Poppins', value: 'Poppins' },
  { label: 'Oswald', value: 'Oswald' }, { label: 'Bebas Neue', value: 'Bebas Neue' }, { label: 'Anton', value: 'Anton' }, { label: 'League Spartan', value: 'League Spartan' },
  { label: 'Archivo Black', value: 'Archivo Black' }, { label: 'DM Sans', value: 'DM Sans' }, { label: 'Manrope', value: 'Manrope' }, { label: 'Nunito', value: 'Nunito' },
  { label: 'Lato', value: 'Lato' }, { label: 'Raleway', value: 'Raleway' }, { label: 'Rubik', value: 'Rubik' }, { label: 'Ubuntu', value: 'Ubuntu' },
  { label: 'Georgia', value: 'Georgia' }, { label: 'Times New Roman', value: 'Times New Roman' }, { label: 'Playfair Display', value: 'Playfair Display' }, { label: 'Merriweather', value: 'Merriweather' },
  { label: 'Cormorant Garamond', value: 'Cormorant Garamond' }, { label: 'Bodoni', value: 'Bodoni MT' }, { label: 'Libre Baskerville', value: 'Libre Baskerville' },
  { label: 'Courier New', value: 'Courier New' }, { label: 'Monospace', value: 'monospace' }, { label: 'Trebuchet MS', value: 'Trebuchet MS' }, { label: 'Verdana', value: 'Verdana' },
  { label: 'Comic', value: 'Comic Sans MS' }, { label: 'Handwritten', value: 'Segoe Print, Bradley Hand, cursive' }, { label: 'Brush Script', value: 'Brush Script MT, cursive' },
  { label: 'Marker', value: 'Chalkboard, Comic Sans MS, cursive' }, { label: 'Typewriter', value: 'Courier New, monospace' },
  { label: 'Arabic-friendly', value: 'Noto Naskh Arabic, Tahoma, sans-serif' }, { label: 'Serif display', value: 'Georgia, Times New Roman, serif' },
  { label: 'Rounded', value: 'Arial Rounded MT Bold, Trebuchet MS, sans-serif' }, { label: 'Condensed', value: 'Impact, Arial Narrow, sans-serif' },
];
export const PREMIUM_STICKER_PACKS: Record<string, string[]> = {
  '\u{1F48E} Premium sticker pack': ['\u{1F48E} PREMIUM', '\u{1F451} VIP', '\u{1F3C5} TOP PICK', '\u{1F4AB} STAR'],
  'Neon labels': ['NEON NIGHT', 'LIVE', 'REC \u25CF', 'NOW PLAYING'],
  'Cinematic badges': ['OFFICIAL RECAP', 'FULL STORY', 'SPOILER ALERT', 'MUST SEE'],
  'Animated emoji pack': ['\u{1F525}\u{1F525}\u{1F525}', '\u{1F602}\u{1F602}\u{1F602}', '\u{1F62D}\u{1F62D}\u{1F62D}', '\u{1F92F}\u{1F92F}\u{1F92F}'],
};

Object.assign(ANIMATION_CSS, { 'Neon flicker':'wy-neon-flicker','Digital scan':'wy-digital-scan','Ticker scroll':'wy-ticker','Popup bounce':'wy-social-pop','Pop shake':'wy-shake','Focus snap':'wy-focus-snap','3D rotate':'wy-3d-flip','Ink reveal':'wy-ink-reveal' });
