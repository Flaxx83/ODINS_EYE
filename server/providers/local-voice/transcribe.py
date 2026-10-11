import sys,pathlib,json,av,numpy as np
from faster_whisper import WhisperModel
root=pathlib.Path(__file__).resolve().parents[3]
model=WhisperModel('base',device='cpu',compute_type='int8',download_root=str(root/'.gev-cache/whisper'),local_files_only=True)
frames=[]
with av.open(sys.argv[1]) as container:
 resampler=av.AudioResampler(format='fltp',layout='mono',rate=16000)
 for frame in container.decode(audio=0):
  for converted in resampler.resample(frame):frames.append(converted.to_ndarray().reshape(-1))
 for converted in resampler.resample(None):frames.append(converted.to_ndarray().reshape(-1))
audio=np.concatenate(frames) if frames else np.zeros(0,dtype=np.float32)
segments,info=model.transcribe(audio,language='sv',vad_filter=True)
print(json.dumps({'text':' '.join(s.text.strip() for s in segments)},ensure_ascii=True))

