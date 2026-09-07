"""Reproducible, non-destructive soundtrack edit. No video re-encoding."""
from pathlib import Path
import subprocess, json, hashlib

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(__file__).resolve().parent
SOURCE = WORK / 'music/source/AKindOfHope.mp3'
MASTER = WORK / 'music/starrylink-opening-master.wav'
AUDITION = WORK / 'music/starrylink-opening-audition.m4a'

def run(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-y', *map(str, args)], check=True, capture_output=True)

# Continuous excerpt: preserve original phrasing, tempo, melody and final cadence.
# Linear attenuation preserves the 14.3 LU source dynamic range (no compressor).
run('-ss', 314, '-t', 22, '-i', SOURCE, '-vn', '-af',
    'afade=t=in:st=0:d=0.4,afade=t=out:st=20.8:d=1.2,volume=-5.58dB',
    '-ar', 48000, '-ac', 2, '-c:a', 'pcm_s24le', MASTER)
credit = "A Kind Of Hope by Scott Buckley - CC BY 4.0 - www.scottbuckley.com.au; StarryLink excerpt 314-336s, fades and gain edit."
run('-i', MASTER, '-c:a', 'aac', '-b:a', '256k', '-metadata', 'title=StarryLink opening - A Kind Of Hope (22s edit)',
    '-metadata', 'artist=Scott Buckley', '-metadata', f'comment={credit}', AUDITION)
temp = WORK / 'music/opening-remux.mp4'
run('-i', ROOT/'demo/assets/opening/opening.mp4', '-i', AUDITION,
    '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-map_metadata', '-1',
    '-metadata', f'comment={credit}', '-movflags', '+faststart', temp)
digest = hashlib.sha256(temp.read_bytes()).hexdigest()
asset = ROOT / f'demo/assets/opening/opening-score-{digest[:12]}.mp4'
asset.write_bytes(temp.read_bytes())
manifest = {'source': str(SOURCE.relative_to(ROOT)), 'sourceSHA256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
 'excerptSeconds':[314,336], 'fadeInSeconds':0.4, 'fadeOutSeconds':1.2, 'gainDB':-5.58,
 'durationSeconds':22, 'sampleRate':48000, 'channels':2,
 'asset':str(asset.relative_to(ROOT)), 'assetSHA256':digest, 'credit':credit,
 'videoEncoding':'stream copy; original 528 H.264 frames retained',
 'listeningReview':'HUMAN_REVIEW_REQUIRED'}
(WORK/'music/render-manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest, indent=2))
