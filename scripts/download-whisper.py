"""Explicit opt-in model download; never run automatically at app startup."""
import pathlib
from faster_whisper import WhisperModel
root = pathlib.Path(__file__).resolve().parents[1]
WhisperModel('base', device='cpu', compute_type='int8', download_root=str(root/'.gev-cache/whisper'))
print('Whisper base finns i .gev-cache/whisper.')
