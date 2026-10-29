# Moves the two newest Gemini downloads into place: older = before, newer = after.
# bash take.sh <ad-id>
cd /c/Users/Thomas/Downloads
set -- "$1" $(ls -t Gemini_Generated_Image_* | head -2)
mv -n "$3" "jib_website/scripts/vis/$1-before.jpg" && mv -n "$2" "jib_website/scripts/vis/$1-after.jpg" && echo "took $1"
