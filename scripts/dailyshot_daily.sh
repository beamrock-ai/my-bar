#!/bin/bash
# 데일리샷 일자별 시세 파이프라인: ① 데일리샷메타 오늘 시세 갱신 ② 대표가 변동분만 오늘자 append
# systemd my-bar-dailyshot.timer가 매일 실행. 개인용·저빈도.
set -eu
cd /home/beamrock/claude-code-beamrock/projects/my-bar
echo "[$(date '+%F %T')] 데일리샷메타 갱신(오늘 시세)…"
/home/beamrock/venv/bin/python3 scripts/dailyshot_collect_whisky.py
echo "[$(date '+%F %T')] 변동분 append 동기화…"
curl -s -X POST http://127.0.0.1:3003/my-bar/api/prices/dailyshot-sync --max-time 300
echo ""
