#!/bin/bash
# usage: deploy_ghp.sh <sha7> <message>   (run from merged main in $REPO)
set -e
SHA=$1; MSG=$2; REPO=${REPO:-/workspace/r67}
export PATH=/home/box/.local/node22/node-v22.23.3-linux-x64/bin:$PATH
cd $REPO
npm run build 2>&1 | tail -1
W=/workspace/ghp-$SHA
rm -rf $W; git worktree add -q $W origin/gh-pages --detach
cd $W
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a $REPO/dist/. .
touch .nojekyll
SHA=$SHA python3 - <<'PY'
import re,os
sha=os.environ['SHA']
s=open('index.html').read()
assert '<meta charset="UTF-8" />' in s
s=s.replace('<meta charset="UTF-8" />','<meta charset="UTF-8" />\n    <meta name="star-rai-build" content="%s" />'%sha,1)
s,n=re.subn(r'(/star-app-2-live/assets/index-[^"\']+\.(?:js|css))',r'\1?v='+sha,s); assert n==2,n
open('index.html','w').write(s)
m=open('manifest.webmanifest').read()
m2=re.sub(r'"start_url"\s*:\s*"[^"]*"','"start_url": "/star-app-2-live/?v=%s"'%sha,m); assert m2!=m
open('manifest.webmanifest','w').write(m2)
w=open('sw.js').read()
w2=re.sub(r'const CACHE = "star-rai-shell-[^"]*";','const CACHE = "star-rai-shell-%s";'%sha,w); assert w2!=w
open('sw.js','w').write(w2)
PY
git add -A
git -c user.name="Cursor Agent" -c user.email="cursoragent@cursor.com" commit -q -m "$MSG on $SHA

Co-authored-by: heytylo-png <heytylo-png@users.noreply.github.com>"
GH_BIN=$(command -v gh); git -c credential.https://github.com.helper= -c "credential.https://github.com.helper=!$GH_BIN auth git-credential" push -q origin HEAD:gh-pages   # gh moved to /usr/local/bin after the 2026-10-17 restore; never force
GH=$(git rev-parse HEAD)
echo "gh-pages $GH"
for i in $(seq 1 40); do r=$(gh api repos/heytylo-png/star-app-2-live/pages/builds/latest --jq '.status + " " + .commit'); case "$r" in "built ${GH}"*) echo "$r"; break;; esac; sleep 8; done
curl -s "https://heytylo-png.github.io/star-app-2-live/?v=$SHA" | grep -E "star-rai-build|assets/index"
cd $REPO; git worktree remove --force $W
