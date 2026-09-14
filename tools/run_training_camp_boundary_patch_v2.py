from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'tools' / 'apply_training_camp_boundary_patch.py'

src = TARGET.read_text()
old = '''rep('app/(tabs)/coaches.tsx',
    \"          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, intervals);\",
    \"          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, scannedSourceFamily, intervals);\",
    count=2)
'''
new = '''rep('app/(tabs)/coaches.tsx',
    \"          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, intervals);\",
    \"          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, scannedSourceFamily, intervals);\")
rep('app/(tabs)/coaches.tsx',
    \"        scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, intervals);\",
    \"        scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, scannedSourceFamily, intervals);\")
'''

if old in src:
    src = src.replace(old, new, 1)
elif 'count=2)' in src:
    raise SystemExit('Unexpected count=2 block remains; refusing to guess.')

# Avoid Python warning on the TypeScript regex literals embedded in the generated test.
src = src.replace(
    "changes['tests/training-camp-boundary-test.ts'] = '''",
    "changes['tests/training-camp-boundary-test.ts'] = r'''",
    1,
)
TARGET.write_text(src)

# The target helper is transactional: it writes product files only after all assertions pass.
runpy.run_path(str(TARGET), run_name='__main__')

# Successful target execution removes itself; keep the staging runner out of the PR too.
Path(__file__).unlink()
print('OK: v2 patch runner completed and removed itself')
