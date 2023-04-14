import express, { Request, Response } from "express";
import http from "http";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { Server } from "socket.io";
import * as wrtc from "wrtc";
import * as NodePty from "node-pty";

const configuration = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};
dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT;
const io = new Server(server);



app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("src"));


app.get("/", (req: Request, res: Response) => {
  res.sendFile(__dirname + "/src/index.html");
});
io.on("connection", socket => {
  var tty: Pty | null = null;
  socket.on("start", message => {
    tty = connectPty(data => {
      socket.emit("data", data);
    }, message.cols, message.rows)
  });
  socket.on("data", str => {
    if (!tty) return;
    tty.data(str);
  });
  socket.on("resize", message => {
    if (!tty) return;
    tty.resize(message.cols, message.rows);
  });
  socket.on("disconnect", () => {
    if (!tty) return;
    tty.close();
  });
});

app.post('/connectrtc', async (req, res) => {
  const { offer, candidates } = req.body;
  const localCandidates: any[] = [];
  let dataChannel;
  const peer = new wrtc.RTCPeerConnection(configuration);
  peer.ondatachannel = (event) => {
    var tty: Pty | null = null;
    dataChannel = event.channel;
    dataChannel.onopen = () => {
      tty = connectPty(dataChannel.send.bind(dataChannel), req.body.cols, req.body.rows);
    };
    dataChannel.onclose = (event) => {
      if (!tty) return;
      tty.close();
    };
    dataChannel.onmessage = (event) => {
      if (!tty) return;
      let msg = JSON.parse(event.data);
      switch (msg.type) {
        case "w": {
          tty.data(msg.w);
          break;
        }
        case "resize": {
          tty.resize(msg.cols, msg.rows);
          break;
        }
      }
    };
  };
  peer.onconnectionstatechange = () => {
    console.log('Connection state:', peer.connectionState);
  };
  peer.onsignalingstatechange = () => {
    console.log('Signaling state:', peer.signalingState);
  };
  peer.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peer.iceConnectionState);
  };
  peer.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', peer.iceGatheringState);
  };
  peer.onicecandidate = (event: any) => {
    if (event.candidate) {
      localCandidates.push(event.candidate);
      return;
    }
    let payload = {
      answer: peer.localDescription,
      candidates: localCandidates,
    };
    res.json(payload);
  };
  await peer.setRemoteDescription(offer);
  let answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  for (let candidate of candidates) {
    await peer.addIceCandidate(candidate);
  }
});

function connectPty(sendData, cols, rows): Pty {
  var open = true;
  const tty = NodePty.spawn(process.env.TTY_SHELL!, [], {
    name: 'xterm-color',
    cols,
    rows,
    cwd: process.env.HOME,
    env: process.env as any
  });
  tty.onData((data) => {
    if (open) {
      sendData(data);
    }
  })

  return {
    data: data => {
      tty.write(data);
    },
    resize: (cols, rows) => {
      tty.resize(cols, rows);
    },
    close: () => {
      open = false;
      tty.kill();
    }
  }
}
interface Pty {
  data: (data: string) => void,
  resize: (cols: number, rows: number) => void,
  close: () => void,
}



server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
