const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

const firebaseConfig = {
  apiKey: "AIzaSyCnIp8y6Zz3Z21ImFpKz7v8B1tRYW8CXjw",
  authDomain: "goppo-24a76.firebaseapp.com",
  projectId: "goppo-24a76",
  storageBucket: "goppo-24a76.appspot.com",
  messagingSenderId: "515280572437",
  appId: "1:515280572437:web:6b31a86e8351cd544b3e1c",
  measurementId: "G-CC45NZZX9T",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

// Global State
let localStream = null;
let remoteStream = null;
let peerConnection = null;

// HTML elements
const joinRoomButton = document.getElementById("join");
const roomNameField = document.getElementById("rome-name");

// 1. Setup media sources

joinRoomButton.onclick = async () => {
  const roomRef = firestore.collection("rooms").doc(roomNameField.value);
  const roomSnapshot =await roomRef.get();

  //Get local stream
  const stream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: true,
  });
  localStream = stream;
  remoteStream = new MediaStream();

  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });
  console.log(roomSnapshot.exists);
  console.log(roomSnapshot.data());
  if (roomSnapshot.exists) {
    _joinRoom(roomNameField.value);
  } else {
    _createRoom(roomNameField.value);
  }

  document.getElementById("remote").srcObject = remoteStream;
};

async function _createRoom(roomName) {
  const roomRef = firestore.collection("rooms").doc(roomName);
  const callerCandidatesCollection = roomRef.collection("callerCandidates");
  const calleeCandidatesCollection = roomRef.collection("calleeCandidates");

  var offerDescription = await peerConnection.createOffer();
  peerConnection.setLocalDescription(offerDescription);

  console.log(roomName);
  console.log(offerDescription);
  const roomWithOffer = {
    offer: {
      type: offerDescription.type,
      sdp: offerDescription.sdp,
    },
  };
  await roomRef.set(roomWithOffer);

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      callerCandidatesCollection.add(event.candidate.toJSON());
    }
  });

  calleeCandidatesCollection.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type == "added") {
        let data = change.doc.data();
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  peerConnection.addEventListener("track", (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  });

  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      const remoteDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(remoteDescription);
    }
  });
}

async function _joinRoom(roomName) {
  const roomRef = firestore.collection("rooms").doc(roomName);
  const callerCandidatesCollection = roomRef.collection("callerCandidates");
  const calleeCandidatesCollection = roomRef.collection("calleeCandidates");

  var roomSnapshot = await roomRef.get();

  if (!roomSnapshot.exists) return;

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      calleeCandidatesCollection.add(event.candidate.toJSON());
    }
  });

  peerConnection.addEventListener("track", (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  });

  const offer = roomSnapshot.data().offer;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  const roomWithAnswer = {
    answer: {
      type: answer.type,
      sdp: answer.sdp,
    },
  };
  await roomRef.update(roomWithAnswer);

  calleeCandidatesCollection.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
}
