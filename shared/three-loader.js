/* The local build is parser-loaded first for file:// and offline classrooms.
   If it is missing, try three pinned CDN mirrors in order: cdnjs -> unpkg -> jsDelivr.
   Every mirror serves the same bytes as shared/vendor, so one SRI hash per revision
   guards all three against a compromised or altered CDN copy. */
const JOURNEY_THREE_SRI = {
  '128': 'sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu',
  '160': 'sha384-qOkzR5Ke/XkQxuGVJ9hpFEpDlcoLtWwVYhnJf06cLIZa2vaIptSqaubivErzmD5O',
};
const JOURNEY_THREE_TIMEOUT_MS = 8000;

async function ensureJourneyThree(revision) {
  const ready = () => window.THREE?.REVISION === revision;
  if (ready()) return window.THREE;
  const version = '0.' + revision + '.0';
  const cdnVersion = revision === '128' ? 'r128' : version;
  const mirrors = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/' + cdnVersion + '/three.min.js',
    'https://unpkg.com/three@' + version + '/build/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@' + version + '/build/three.min.js',
  ];
  for (const src of mirrors) {
    await new Promise(resolve => {
      const script = document.createElement('script');
      if (JOURNEY_THREE_SRI[revision]) {
        script.integrity = JOURNEY_THREE_SRI[revision];
        script.crossOrigin = 'anonymous';
      }
      script.src = src;
      const finish = () => { clearTimeout(timeout); script.remove(); resolve(); };
      const timeout = setTimeout(finish, JOURNEY_THREE_TIMEOUT_MS);
      script.onload = script.onerror = finish;
      document.head.append(script);
    });
    if (ready()) return window.THREE;
  }
  throw new Error('Three.js r' + revision + ' is unavailable.');
}
