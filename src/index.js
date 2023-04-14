var t = new hterm.Terminal();
t.decorate(document.querySelector('#terminal'));

if (!localStorage.getItem("visited")) {
  localStorage.setItem("stun", "stun:stun.l.google.com:19302");
  localStorage.setItem("usewebrtc", true);
  localStorage.setItem("visited", true);
}

const rtcConf = {
  iceServers: [
    {
      urls: localStorage.getItem("stun"),
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

t.onTerminalReady = async () => {
  t.setBackgroundColor("#292c3c");
  const io = t.io.push();
  const log = msg => {
    t.io.println(`tiTTY LOG: ${msg}`);
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
  }

  let ttyint = {
    ondata,
    onconnect,
    ondisconnect,
    cols: t.screenSize.width - 1,
    rows: t.screenSize.height - 1
  }

  let channel = localStorage.getItem("usewebrtc") ?
    await rtcConnect(ttyint) :
    wsConnect(ttyint);


  document.querySelector("#terminal").addEventListener("resize", () => {
    channel.resize(t.screenSize.width, t.screenSize.height);
  });
  new ResizeObserver(() =>
    channel.resize(t.screenSize.width, t.screenSize.height)
  ).observe(document.querySelector("#terminal"));
  io.onVTKeystroke = (str) => {
    channel.send(str);
  }
  io.sendString = str => {
    channel.send(str);
  }
}

