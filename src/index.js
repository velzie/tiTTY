const ESC = "\x1B";
const CR = "\x0D";
const rtcConf = {
  iceServers: [
    {
      urls: localStorage.getItem("_x_stun")?.replaceAll('"', ''),
    },
  ],
};

async function rtcConnect(ttyint) {
  const localCandidates = [];
  const peer = new RTCPeerConnection(rtcConf);
  peer.onconnectionstatechange = (event) => {
    console.log('Connection state:', peer.connectionState);
  };
  peer.onsignalingstatechange = (event) => {
    console.log('Signaling state:', peer.signalingState);
  };
  peer.oniceconnectionstatechange = (event) => {
    console.log('ICE connection state:', peer.iceConnectionState);
    if (peer.iceConnectionState == "disconnected" || peer.iceConnectionState == "failed") {
      ondisconnect();
    }
  };
  peer.onicegatheringstatechange = (event) => {
    console.log('ICE gathering state:', peer.iceGatheringState);
  };
  peer.onicecandidate = async (event) => {
    if (event.candidate) {
      localCandidates.push(event.candidate);
      return;
    }
    // Step 6. Send Offer and client candidates to server
    const response = await fetch('/connectrtc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offer: offer,
        candidates: localCandidates,
        rows: ttyint.rows,
        cols: ttyint.cols,
      }),
    });
    const { answer, candidates } = await response.json();
    // Step 7. Set remote description with Answer from server
    await peer.setRemoteDescription(answer);
    // Step 8. Add ICE candidates from server
    for (let candidate of candidates) {
      await peer.addIceCandidate(candidate);
    }
  };
  const dataChannel = peer.createDataChannel('host-server');
  dataChannel.onopen = ttyint.onconnect;
  dataChannel.onclose = ttyint.ondisconnect;
  dataChannel.onmessage = event => ttyint.ondata(event.data);


  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  return {
    send: str =>
      dataChannel.send(JSON.stringify({
        type: "w",
        w: str
      })),
    resize: (cols, rows) =>
      dataChannel.send(JSON.stringify({
        type: "resize",
        rows,
        cols,
      })),
    close: peer.close.bind(peer)
  };
}
async function wsConnect(ttyint) {
  const socket = io();
  socket.on("data", d => {
    ttyint.ondata(d);
  });
  socket.on("disconnect", ttyint.ondisconnect);

  socket.emit("start", {
    cols: ttyint.cols,
    rows: ttyint.rows,
  });
  ttyint.onconnect();

  return {
    send: str => socket.emit("data", str),
    resize: (cols, rows) => socket.emit("resize", {
      cols,
      rows,
    }),
    close: socket.disconnect.bind(socket),
  }
}
// format is rgb
function ansiFBG(fg, bg) {
  let fgs = fg ? `${ESC}[38;2;${fg[0]};${fg[1]};${fg[2]}m` : ""
  let bgs = bg ? `${ESC}[48;2;${bg[0]};${bg[1]};${bg[2]}m` : ""
  return fgs + bgs;
}
// https://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately
function HSVtoRGB(hsv) {
  let [h, s, v] = hsv;
  h /= 255;
  s /= 255;
  v /= 255;
  var r, g, b, i, f, p, q, t;

  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ];
}
function rainbowText(text) {
  let h = 0;
  let interval = 255 / text.length * 2;

  let str = "";
  for (let chr of text.split('')) {
    str += ansiFBG(HSVtoRGB([h, 255, 255])) + chr;
    h += interval;
  }
  return str;
}

addEventListener("load", () => {
  var t = new hterm.Terminal();
  t.decorate(document.querySelector('#terminal'));

  t.onTerminalReady = async () => {
    t.setBackgroundColor("#292c3c");
    t.prefs_.set("font-family", '"DejaVu Sans Mono", "Noto Sans Mono", "Everson Mono", FreeMono, Menlo, Terminal, FiraCode Nerd Font, monospace')
    t.prefs_.set('user-css', 'https://mshaugh.github.io/nerdfont-webfonts/build/firacode-nerd-font.css');
    const io = t.io.push();
    const log = msg => {
      t.io.println(`${CR}${ansiFBG([255, 0, 255])}[tiTTY LOG]: ${msg}${ESC}[0m`);
    }

    const ondata = (data) => {
      t.io.print(data);
    }
    const ondisconnect = () => {
      log("disconnected from server");
    }
    const onconnect = () => {
      log("connected to server");
      t.installKeyboard();
      io.onVTKeystroke = (str) => {
        channel.send(str);
        console.log(str);
      }
      io.sendString = str => {
        channel.send(str);
        console.log(str);
      }

      let old_w, old_h;
      let doresize = () => {
        let [w, h] = [t.screenSize.width, t.screenSize.height];
        channel.resize(w, h);
        [old_w, old_h] = [w, h];
      }

      document.querySelector("#terminal").addEventListener("resize", doresize);
      new ResizeObserver(doresize).observe(document.querySelector("#terminal"));
      // and for some fucking reason, both these ^^^ don't like to fire sometimes so 
      setInterval(() => {
        let [w, h] = [t.screenSize.width, t.screenSize.height];
        if (w != old_w || h != old_h)
          doresize();
      }, 100);
    }

    let ttyint = {
      ondata,
      onconnect,
      ondisconnect,
      cols: t.screenSize.width - 1,
      rows: t.screenSize.height - 1
    }

    let channel = localStorage.getItem("_x_usewebrtc") == "true" ?
      await rtcConnect(ttyint) :
      await wsConnect(ttyint);

    window._log = log;
    window._term = t;
  }
})

async function activatefullscreen() {
  await document.documentElement.requestFullscreen();
  await navigator.keyboard.lock();
}


