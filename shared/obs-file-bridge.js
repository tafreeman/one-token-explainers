/* Local HTML files can open in separate opaque origins. Use a private channel
   for the same scene calls that the hosted pages make directly. */
(function () {
  'use strict';
  const commands = new Set(['setRealm', 'setSkin', 'focus', 'setPose', 'setHighlight',
    'setLabels', 'setPlaying', 'setControls', 'setKV', 'setBackprop', 'setMoeOffset',
    'setRouting', 'suspend', 'resume', 'renderNow', 'resize']);

  window.journeyObservatory = async function (frame, stops) {
    if (location.protocol !== 'file:') return frame.contentWindow.obs.ready;
    try {
      if (frame.contentWindow.obs) return frame.contentWindow.obs.ready;
    } catch (err) {
      if (err.name !== 'SecurityError') throw err;
    }
    const {port1, port2} = new MessageChannel();
    const groups = stops.filter(s => s.ch === 3).map(s => s.ids);
    const ready = new Promise((resolve, reject) => {
      port1.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data);
    });
    frame.contentWindow.postMessage({type: 'journey-file-connect', groups}, '*', [port2]);
    const {components, poses} = await ready;
    const records = new Map(components.map(c => [c.id, c]));
    const api = {
      components: () => components,
      getComponent: id => records.get(id),
      poseFor: ids => poses[ids.join(',')],
      project: id => projection?.id === id ? projection.point : null,
      textView(target) {
        for (const c of components) {
          const article = document.createElement('article');
          const title = document.createElement('h3'); title.textContent = c.id + ' · ' + c.title;
          article.append(title);
          for (const [tag, text] of [['p', c.what], ['p', c.doing], ['p', c.narrative],
            ['code', c.equation], ['p', c.keyFact + ' (' + c.keyFactSource + ')']]) {
            const node = document.createElement(tag); node.textContent = text; article.append(node);
          }
          target.append(article);
        }
      }
    };
    let projection;
    port1.onmessage = ({data}) => { projection = data; };
    for (const name of commands) api[name] = (...args) => port1.postMessage({name, args});
    return api;
  };
  if (location.protocol === 'file:' && parent !== window) {
    window.addEventListener('message', async event => {
      if (event.source !== parent || event.origin !== 'null' ||
          event.data?.type !== 'journey-file-connect' || !event.ports[0]) return;
      const port = event.ports[0];
      try {
        const api = await window.obs.ready;
        const poses = {};
        for (const ids of event.data.groups) poses[ids.join(',')] = api.poseFor(ids, {zoom: 1.14});
        port.postMessage({components: api.components(), poses});
        let focused;
        port.onmessage = ({data: {name, args}}) => {
          if (!commands.has(name) || !Array.isArray(args)) return;
          api[name](...args);
          if (name === 'focus') focused = args[0][0];
          if (focused && ['focus', 'setPose', 'resize', 'renderNow'].includes(name)) {
            port.postMessage({id: focused, point: api.project(focused)});
          }
        };
      } catch (err) { port.postMessage({error: err.message}); }
    });
  }
})();
