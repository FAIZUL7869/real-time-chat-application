import {
    FiPaperclip,
    FiSend,
    FiMic,
    FiPhone,
    FiPhoneOff,
} from "react-icons/fi";

import socket from "../socket/socket";
import { useEffect, useState, useRef } from "react";
import EmojiPicker from "emoji-picker-react";
import API from "../services/api";
const formatLastSeen = (date) => {
    if (!date) return "Offline";

    const lastSeen = new Date(date);
    const now = new Date();

    const isToday =
        lastSeen.toDateString() === now.toDateString();

    if (isToday) {
        return `Last seen ${lastSeen.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        })}`;
    }

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    if (lastSeen.toDateString() === yesterday.toDateString()) {
        return "Last seen yesterday";
    }

    return `Last seen ${lastSeen.toLocaleDateString()}`;
};
export default function Home() {
    const [menuOpen, setMenuOpen] = useState(null);
    const [users, setUsers] = useState([]);
    const [audioBlobUrl, setAudioBlobUrl] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [replyMessage, setReplyMessage] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [typingUser, setTypingUser] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const messagesEndRef = useRef(null);
    const selectedUserRef = useRef(null);
    const typingRef = useRef(false);
    const typingTimeoutRef = useRef(null);
    const [page, setPage] = useState(1);
    const chatContainerRef = useRef(null);
    const previousHeightRef = useRef(0);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    // =========================
    // VOICE CALL STATES
    // =========================

    const [callStatus, setCallStatus] = useState("idle");
    // idle | calling | incoming | connected

    const [incomingCall, setIncomingCall] = useState(null);
    const [callPeerName, setCallPeerName] = useState("");

    const [isMuted, setIsMuted] = useState(false);

    const [callDuration, setCallDuration] = useState(0);

    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);
    const callTimerRef = useRef(null);
    const callTargetRef = useRef(null);
    const incomingOfferRef = useRef(null);
    const pendingIceCandidatesRef = useRef([]);
    const rtcConfig = {
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302",
            },
        ],
    };
    const currentUser = JSON.parse(localStorage.getItem("user"));
    useEffect(() => {
        selectedUserRef.current = selectedUser;
    }, [selectedUser]);
    useEffect(() => {
        fetchUsers();

        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
    }, []);
    useEffect(() => {
        if (selectedUser) {
            fetchMessages();
        }
    }, [selectedUser, page]);
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden && selectedUser) {
                fetchMessages();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
        };
    }, [selectedUser]);
    useEffect(() => {
        fetchUsers();
    }, [onlineUsers]);

    useEffect(() => {
        const token = localStorage.getItem("token");
        const user = JSON.parse(localStorage.getItem("user"));

        if (!token || !user) return;

        socket.connect();

        socket.on("connect", () => {
            socket.emit("join", user._id);
        });

        socket.on("receiveMessage", (newMessage) => {
            console.log("📩 Received:", newMessage);
            const currentChatId = selectedUserRef.current?._id;

            if (
                (newMessage.sender === currentChatId &&
                    newMessage.receiver === currentUser._id) ||
                (newMessage.sender === currentUser._id &&
                    newMessage.receiver === currentChatId)
            ) {
                setMessages((prev) => {
                    const exists = prev.some((msg) => msg._id === newMessage._id);
                    if (exists) return prev;
                    return [...prev, newMessage];
                });
            } else {
                setUnreadCounts((prev) => ({
                    ...prev,
                    [newMessage.sender]: (prev[newMessage.sender] || 0) + 1,
                }));
            }



            if (
                Notification.permission === "granted" &&
                document.hidden &&
                newMessage.sender !== currentUser._id
            ) {
                new Notification("💜 SoulMate Chat", {
                    body: newMessage.text
                        ? newMessage.text
                        : newMessage.image
                            ? "📷 Image"
                            : "🎤 Voice message",
                    icon: "/favicon.ico",
                });
            }

            socket.emit("messageDelivered", {
                messageId: newMessage._id,
                senderId: newMessage.sender,
            });

            if (
                !document.hidden &&
                newMessage.sender === selectedUserRef.current?._id
            ) {
                const token = localStorage.getItem("token");

                API.patch(
                    `/messages/seen/${newMessage._id}`,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );
            }
        });
        socket.on("onlineUsers", (users) => {
            console.log("Online Users:", users);
            setOnlineUsers(users);
        });
        socket.on("typing", (senderId) => {
            console.log("Typing received:", senderId);
            setTypingUser(senderId);
        });

        socket.on("stopTyping", () => {
            setTypingUser(null);
        });
        socket.on("messageDelivered", (data) => {
            console.log("✅ messageDelivered event:", data);

            setMessages((prev) => {
                console.log("Current messages:", prev);

                return prev.map((msg) => {
                    console.log("Comparing:", msg._id, "==", data.messageId);

                    if (msg._id === data.messageId) {
                        console.log("MATCH FOUND!");

                        return {
                            ...msg,
                            delivered: true,
                        };
                    }

                    return msg;
                });
            });
        });
        socket.on("messageSeen", async () => {
            console.log("💜 Seen event received");

            if (selectedUserRef.current) {
                const token = localStorage.getItem("token");

                const res = await API.get(
                    `/messages/${selectedUserRef.current._id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                setMessages(res.data);
            }
        });
        socket.on("messageDeleted", ({ messageId }) => {
            setMessages((prev) =>
                prev.filter((msg) => msg._id !== messageId)
            );
        });
        // =========================
        // VOICE CALL LISTENERS
        // =========================

        socket.on("incomingCall", ({ callerId, callerName }) => {
            console.log("📞 Incoming call from:", callerId);

            setIncomingCall({
                callerId,
                callerName,
            });
            setCallPeerName(callerName || "Voice Call");

            setCallStatus("incoming");
        });
        socket.on("webrtcOffer", ({ callerId, receiverId, offer }) => {
            console.log("📡 WebRTC offer received from:", callerId);

            incomingOfferRef.current = {
                callerId,
                receiverId,
                offer,
            };

            console.log("✅ Offer stored. Waiting for user to accept.");
        });

        socket.on("webrtcAnswer", async ({ receiverId, answer }) => {
            console.log("📡 WebRTC answer received");

            try {
                if (!peerConnectionRef.current) {
                    console.log("❌ No peer connection found");
                    return;
                }

                await peerConnectionRef.current.setRemoteDescription(
                    new RTCSessionDescription(answer)
                );

                console.log("✅ Remote description set");
                if (pendingIceCandidatesRef.current.length > 0) {
                    for (const candidate of pendingIceCandidatesRef.current) {
                        await peerConnectionRef.current.addIceCandidate(
                            new RTCIceCandidate(candidate)
                        );
                    }

                    pendingIceCandidatesRef.current = [];

                    console.log("🧊 Pending ICE candidates added");
                }
            } catch (error) {
                console.error("❌ Error handling WebRTC answer:", error);
            }
        });
        socket.on("iceCandidate", async ({ senderId, receiverId, candidate }) => {
            console.log("🧊 ICE candidate received from:", senderId);

            try {
                if (!peerConnectionRef.current) {
                    console.log("⏳ Peer connection not ready. Storing ICE candidate.");

                    pendingIceCandidatesRef.current.push(candidate);

                    return;
                }

                if (!peerConnectionRef.current.remoteDescription) {
                    console.log("⏳ Remote description not ready. Storing ICE candidate.");

                    pendingIceCandidatesRef.current.push(candidate);

                    return;
                }

                await peerConnectionRef.current.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );

                console.log("🧊 ICE candidate added");
            } catch (error) {
                console.error("❌ Error adding ICE candidate:", error);
            }
        });
        socket.on("callUnavailable", () => {
            console.log("📵 User is unavailable");

            alert("User is currently offline.");

            endVoiceCall(false);
        });

        socket.on("callCancelled", () => {
            console.log("📞 Incoming call cancelled");

            setIncomingCall(null);
            setCallStatus("idle");

            incomingOfferRef.current = null;
            callTargetRef.current = null;

            pendingIceCandidatesRef.current = [];
        });

        socket.on("callAccepted", ({ receiverId }) => {
            console.log("✅ Call accepted by:", receiverId);

            setCallStatus("calling");

            console.log("📞 Receiver accepted the call");
        });

        socket.on("callDeclined", () => {
            console.log("❌ Call declined");

            alert("Call declined.");

            endVoiceCall(false);
        });

        socket.on("callEnded", () => {
            console.log("☎️ Call ended by other user");

            endVoiceCall(false);
        });
        return () => {
            socket.off("connect");
            socket.off("receiveMessage");
            socket.off("onlineUsers");
            socket.off("typing");
            socket.off("stopTyping");
            socket.off("messageDelivered");
            socket.off("messageSeen");
            socket.off("messageDeleted");
            socket.off("incomingCall");
            socket.off("callUnavailable");
            socket.off("callCancelled");
            socket.off("callAccepted");
            socket.off("callDeclined");
            socket.off("callEnded");
            socket.off("iceCandidate");
            socket.off("webrtcOffer");
            socket.off("webrtcAnswer");
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        if (selectedUser) {
            fetchMessages();
        }
    }, [selectedUser]);
    useEffect(() => {
        selectedUserRef.current = selectedUser;
    }, [selectedUser]);

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem("token");

            const res = await API.get("/chat/users", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            console.table(
                res.data.map((user) => ({
                    name: user.name,
                    lastSeen: user.lastSeen,
                }))
            );

            setUsers(res.data);

            if (!selectedUser && res.data.length > 0) {
                setSelectedUser(res.data[0]);
            }
        } catch (error) {
            console.log(error);
        }
    };

    const fetchMessages = async () => {
        console.log("📥 fetchMessages called");
        try {
            const token = localStorage.getItem("token");

            if (page > 1 && chatContainerRef.current) {
                previousHeightRef.current = chatContainerRef.current.scrollHeight;
            }

            const res = await API.get(`/messages/${selectedUser._id}?page=${page}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (page === 1) {
                setMessages(res.data);
            } else {
                setMessages((prev) => [...res.data, ...prev]);

            }

            if (page > 1) {
                setTimeout(() => {
                    if (chatContainerRef.current) {
                        const newHeight = chatContainerRef.current.scrollHeight;
                        chatContainerRef.current.scrollTop +=
                            newHeight - previousHeightRef.current;
                    }
                }, 0);
            }
            setLoadingMessages(false);

            setHasMore(res.data.length === 30);
            console.log("Messages fetched:", res.data);
            res.data.forEach(async (msg) => {
                if (msg.sender === selectedUser._id && !msg.seen) {
                    await API.patch(
                        `/messages/seen/${msg._id}`,
                        {},
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                        }
                    );
                }
            });
        } catch (error) {
            console.log(error);
            setLoadingMessages(false);
        }
    };
    // =========================
    // CREATE WEBRTC CONNECTION
    // =========================

    const createPeerConnection = (targetUserId) => {
        const peerConnection = new RTCPeerConnection(rtcConfig);

        peerConnectionRef.current = peerConnection;

        // Send our ICE candidates to the other user
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("iceCandidate", {
                    senderId: currentUser._id,
                    receiverId: targetUserId,
                    candidate: event.candidate,
                });
            }
        };

        // Receive the other user's audio
        peerConnection.ontrack = (event) => {
            console.log("🔊 Remote audio received");

            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = event.streams[0];

                remoteAudioRef.current
                    .play()
                    .catch((error) => {
                        console.log(
                            "Audio playback waiting for user interaction:",
                            error
                        );
                    });
            }
        };

        // Monitor WebRTC connection
        peerConnection.onconnectionstatechange = () => {
            console.log(
                "📡 WebRTC connection:",
                peerConnection.connectionState
            );

            if (
                peerConnection.connectionState === "connected"
            ) {
                console.log("🎉 Voice call connected");

                setCallStatus("connected");
                startCallTimer();
            }

            if (
                peerConnection.connectionState === "failed" ||
                peerConnection.connectionState === "disconnected" ||
                peerConnection.connectionState === "closed"
            ) {
                console.log("📴 WebRTC connection ended");

                endVoiceCall(false);
            }
        };

        // Add our microphone tracks
        if (localStreamRef.current) {
            localStreamRef.current
                .getTracks()
                .forEach((track) => {
                    peerConnection.addTrack(
                        track,
                        localStreamRef.current
                    );
                });
        }

        return peerConnection;
    };
    // =========================
    // CALL TIMER
    // =========================

    const startCallTimer = () => {
        clearInterval(callTimerRef.current);

        setCallDuration(0);

        callTimerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
        }, 1000);
    };

    const stopCallTimer = () => {
        if (callTimerRef.current) {
            clearInterval(callTimerRef.current);
            callTimerRef.current = null;
        }

        setCallDuration(0);
    };
    // =========================
    // START VOICE CALL
    // =========================

    const startVoiceCall = async () => {
        if (!selectedUser) {
            return;
        }

        if (callStatus !== "idle") {
            return;
        }

        console.log("📞 Starting voice call...");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            localStreamRef.current = stream;

            callTargetRef.current = selectedUser._id;
            setCallPeerName(selectedUser.name);
            setCallStatus("calling");
            setCallDuration(0);

            const peerConnection = createPeerConnection(
                selectedUser._id
            );

            const offer = await peerConnection.createOffer();

            await peerConnection.setLocalDescription(offer);

            socket.emit("callUser", {
                callerId: currentUser._id,
                receiverId: selectedUser._id,
                callerName: currentUser.name,
            });

            socket.emit("webrtcOffer", {
                callerId: currentUser._id,
                receiverId: selectedUser._id,
                offer,
            });

            console.log("📡 WebRTC offer sent");
        } catch (error) {
            console.error("❌ Could not start voice call:", error);

            if (localStreamRef.current) {
                localStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop());

                localStreamRef.current = null;
            }

            setCallStatus("idle");
            callTargetRef.current = null;

            alert(
                "Microphone access is required to make a voice call."
            );
        }
    };
    // =========================
    // ACCEPT VOICE CALL
    // =========================

    const acceptCall = async () => {
        if (!incomingCall) {
            return;
        }

        if (!incomingOfferRef.current) {
            console.log("❌ No WebRTC offer available");
            return;
        }

        console.log("✅ Accepting voice call...");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            localStreamRef.current = stream;

            const {
                callerId,
                receiverId,
                offer,
            } = incomingOfferRef.current;

            callTargetRef.current = callerId;

            const peerConnection = createPeerConnection(callerId);

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            if (pendingIceCandidatesRef.current.length > 0) {
                for (const candidate of pendingIceCandidatesRef.current) {
                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(candidate)
                    );
                }

                pendingIceCandidatesRef.current = [];

                console.log("🧊 Pending ICE candidates added");
            }
            const answer = await peerConnection.createAnswer();

            await peerConnection.setLocalDescription(answer);

            socket.emit("acceptCall", {
                callerId,
                receiverId: currentUser._id,
            });

            socket.emit("webrtcAnswer", {
                callerId,
                receiverId,
                answer,
            });

            setIncomingCall(null);
            setCallStatus("calling");

            console.log("📡 WebRTC answer sent");
            console.log("📞 Call accepted successfully");

        } catch (error) {
            console.error("❌ Error accepting call:", error);

            if (localStreamRef.current) {
                localStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop());

                localStreamRef.current = null;
            }

            setCallStatus("idle");
            setIncomingCall(null);
            callTargetRef.current = null;
            incomingOfferRef.current = null;
            pendingIceCandidatesRef.current = [];

            alert("Microphone access is required to answer the call.");
        }
    };
    // =========================
    // DECLINE VOICE CALL
    // =========================

    const declineCall = () => {
        if (!incomingCall) {
            return;
        }

        console.log("❌ Declining voice call...");

        const callerId = incomingCall.callerId;

        socket.emit("declineCall", {
            callerId: callerId,
            receiverId: currentUser._id,
        });

        setIncomingCall(null);
        setCallStatus("idle");

        incomingOfferRef.current = null;
        callTargetRef.current = null;
        pendingIceCandidatesRef.current = [];
        console.log("📞 Call declined");
    };
    // =========================
    // END VOICE CALL
    // =========================

    const endVoiceCall = (notifyOtherUser = true) => {
        console.log("☎️ Ending voice call...");

        const targetUserId = callTargetRef.current;

        // Stop microphone
        if (localStreamRef.current) {
            localStreamRef.current
                .getTracks()
                .forEach((track) => track.stop());

            localStreamRef.current = null;
        }

        // Close WebRTC connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Stop call timer
        stopCallTimer();

        // Notify the other user
        if (notifyOtherUser && targetUserId) {
            socket.emit("endCall", {
                callerId: currentUser._id,
                receiverId: targetUserId,
            });
        }

        // Reset call state
        setCallStatus("idle");
        setIncomingCall(null);
        setIsMuted(false);
        setCallPeerName("");

        callTargetRef.current = null;
        incomingOfferRef.current = null;
        pendingIceCandidatesRef.current = [];

        console.log("☎️ Voice call ended");
    };
    // =========================
    // TOGGLE MUTE
    // =========================

    const toggleMute = () => {
        if (!localStreamRef.current) {
            return;
        }

        const audioTrack = localStreamRef.current
            .getAudioTracks()[0];

        if (!audioTrack) {
            return;
        }

        audioTrack.enabled = !audioTrack.enabled;

        setIsMuted(!audioTrack.enabled);

        console.log(
            audioTrack.enabled
                ? "🎤 Microphone unmuted"
                : "🔇 Microphone muted"
        );
    };
    const deleteMessage = async (messageId) => {
        try {
            const token = localStorage.getItem("token");

            await API.delete(`/messages/${messageId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            setMessages((prev) =>
                prev.filter((msg) => msg._id !== messageId)
            );

        } catch (error) {
            console.log("Delete Error:", error);
        }
    };
    const startRecording = async () => {
        console.log("🎤 Mic button pressed");

        try {
            if (!navigator.mediaDevices) {
                alert("navigator.mediaDevices is not supported");
                return;
            }

            if (!navigator.mediaDevices.getUserMedia) {
                alert("getUserMedia is not supported");
                return;
            }

            console.log("Requesting microphone permission...");

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            console.log("✅ Permission granted");

            const recorder = new MediaRecorder(stream);

            console.log("✅ MediaRecorder created");

            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            recorder.onstop = () => {
                console.log("✅ Recording stopped");

                const audioBlob = new Blob(audioChunksRef.current, {
                    type: "audio/webm",
                });

                setAudioBlob(audioBlob);

                const url = URL.createObjectURL(audioBlob);

                setAudioBlobUrl(url);
                setIsRecording(false);

                stream.getTracks().forEach((track) => track.stop());
            };

            recorder.start();

            console.log("✅ Recording started");

            setIsRecording(true);

        } catch (err) {
            console.error(err);
            alert("Microphone Error: " + err.message);
        }
    };

    const stopRecording = () => {
        if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
        ) {
            mediaRecorderRef.current.stop();
        }
    };
    const sendMessage = async () => {
        console.log("🚀 Send button clicked");
        if (!text.trim() && !selectedImage && !selectedVideo && !audioBlob) return;
        console.log("1. sendMessage started");
        try {
            const token = localStorage.getItem("token");

            const formData = new FormData();

            formData.append("receiver", selectedUser._id);
            formData.append("text", text);
            if (replyMessage) {
                formData.append("replyTo", replyMessage._id);
            }

            // Upload Image
            if (selectedImage) {
                formData.append("image", selectedImage);
            }

            // Upload Video
            if (selectedVideo) {
                formData.append("image", selectedVideo);
            }

            // Upload Voice
            if (audioBlob) {
                formData.append("image", audioBlob, "voice.webm");
            }
            console.log("Selected Image:", selectedImage);
            console.log("Image in FormData:", formData.get("image"));
            console.log("Selected Video:", selectedVideo);
            console.log("🎥 Video in FormData:", formData.get("image"));
            console.log("2. Before API");
            console.log("Audio Blob:", audioBlob);
            console.log("Audio MIME:", audioBlob?.type);
            console.log("File in FormData:", formData.get("image"));
            console.log("🎤 AudioBlob:", audioBlob);
            console.log("🎤 Audio size:", audioBlob?.size);
            console.log("🎤 Audio type:", audioBlob?.type);
            console.log("🎤 FormData file:", formData.get("image"));
            const res = await API.post(
                "/messages",
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                }
            );
            console.log("3. API Response", res);
            setMessages((prev) => [...prev, res.data.data]);
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({
                    behavior: "smooth",
                });
            }, 50);
            console.log("Reply response:", res.data.data);
            setReplyMessage(null);
            console.log("4. Message added");
            setText("");
            setSelectedImage(null);
            setAudioBlob(null);
            setAudioBlobUrl(null);
            setSelectedVideo(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            console.log("5. Cleared");
        } catch (error) {
            console.log("❌ Error:", error);
            console.log("❌ Response:", error.response);
        }
    };
    return (
        <div className="h-screen bg-slate-100 flex">
            {/* =========================
    INCOMING CALL POPUP
========================= */}

            {callStatus === "incoming" && incomingCall && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">

                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 text-center">

                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FiPhone
                                size={36}
                                className="text-green-600"
                            />
                        </div>

                        <h2 className="text-xl font-bold text-gray-800">
                            Incoming Call
                        </h2>

                        <p className="text-gray-500 mt-2">
                            {incomingCall.callerName || "Someone"} is calling you
                        </p>

                        <div className="flex justify-center gap-6 mt-6">

                            {/* DECLINE */}
                            <button
                                onClick={declineCall}
                                className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-full transition"
                                title="Decline"
                            >
                                <FiPhoneOff size={24} />
                            </button>

                            {/* ACCEPT */}
                            <button
                                onClick={acceptCall}
                                className="bg-green-500 hover:bg-green-600 text-white p-4 rounded-full transition"
                                title="Accept"
                            >
                                <FiPhone size={24} />
                            </button>

                        </div>

                    </div>

                </div>
            )}
            {/* =========================
    ACTIVE VOICE CALL SCREEN
========================= */}

            {(callStatus === "calling" || callStatus === "connected") && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[90]">

                    <div className="bg-white rounded-3xl shadow-2xl p-8 w-80 text-center">

                        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                            <FiPhone
                                size={40}
                                className="text-green-600"
                            />
                        </div>

                        <h2 className="text-2xl font-bold text-gray-800">
                            {callPeerName || selectedUser?.name || "Voice Call"}
                        </h2>

                        <p className="text-gray-500 mt-2">
                            {callStatus === "calling"
                                ? "Calling..."
                                : `${String(Math.floor(callDuration / 60)).padStart(2, "0")}:${String(callDuration % 60).padStart(2, "0")}`}
                        </p>

                        <div className="flex justify-center gap-6 mt-8">

                            {/* MUTE */}
                            <button
                                onClick={toggleMute}
                                className={`p-4 rounded-full transition ${isMuted
                                    ? "bg-red-500 text-white"
                                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                    }`}
                                title={isMuted ? "Unmute" : "Mute"}
                            >
                                <FiMic size={24} />
                            </button>

                            {/* END CALL */}
                            <button
                                onClick={() => {
                                    if (callStatus === "calling" && callTargetRef.current) {
                                        socket.emit("cancelCall", {
                                            callerId: currentUser._id,
                                            receiverId: callTargetRef.current,
                                        });

                                        endVoiceCall(false);
                                    } else {
                                        endVoiceCall(true);
                                    }
                                }}
                                className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-full transition"
                                title="End call"
                            >
                                <FiPhoneOff size={24} />
                            </button>

                        </div>

                    </div>

                </div>
            )}
            {/* Sidebar */}
            <div className="w-[320px] bg-white shadow-lg flex flex-col">

                <div className="p-5 border-b">
                    <h1 className="text-2xl font-bold text-blue-700">
                        SoulMate Chat
                    </h1>

                    <p className="text-gray-500 text-sm mt-1">
                        Chats
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {users.map((user) => (
                        <div
                            key={user._id}
                            onClick={() => {
                                setPage(1);
                                setHasMore(true);

                                setSelectedUser(user);

                                setUnreadCounts((prev) => ({
                                    ...prev,
                                    [user._id]: 0,
                                }));
                            }}
                            className={`flex items-center gap-3 p-4 border-b cursor-pointer transition ${selectedUser?._id === user._id
                                ? "bg-blue-100"
                                : "hover:bg-slate-100"
                                }`}
                        >
                            <img
                                src={
                                    user.profilePic ||
                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`
                                }
                                alt={user.name}
                                className="w-12 h-12 rounded-full object-cover"
                            />

                            <div className="flex-1">
                                <div className="flex justify-between items-center">
                                    <h2 className="font-semibold">{user.name}</h2>

                                    {unreadCounts[user._id] > 0 && (
                                        <span className="bg-blue-600 text-white text-xs rounded-full min-w-6 h-6 px-2 flex items-center justify-center">
                                            {unreadCounts[user._id]}
                                        </span>
                                    )}
                                </div>

                                <p
                                    className={`text-sm ${onlineUsers.includes(user._id)
                                        ? "text-green-600"
                                        : "text-gray-500"
                                        }`}
                                >
                                    {onlineUsers.includes(user._id)
                                        ? "🟢 Online"
                                        : formatLastSeen(user.lastSeen)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">

                <div className="bg-white shadow p-5 flex items-center justify-between">

                    <div>
                        <h2 className="font-bold text-xl">
                            {selectedUser ? selectedUser.name : "Select a user"}
                        </h2>

                        {selectedUser && (
                            <p
                                className={`text-sm ${typingUser === selectedUser._id
                                    ? "text-blue-600"
                                    : onlineUsers.includes(selectedUser._id)
                                        ? "text-green-600"
                                        : "text-gray-500"
                                    }`}
                            >
                                {typingUser === selectedUser._id
                                    ? "Typing..."
                                    : onlineUsers.includes(selectedUser._id)
                                        ? "🟢 Online"
                                        : formatLastSeen(selectedUser.lastSeen)}
                            </p>
                        )}
                    </div>

                    {selectedUser && callStatus === "idle" && (
                        <button
                            onClick={startVoiceCall}
                            className="bg-green-500 hover:bg-green-600 text-white p-3 rounded-full transition"
                            title="Voice call"
                        >
                            <FiPhone size={20} />
                        </button>
                    )}

                </div>

                <div
                    ref={chatContainerRef}
                    className="flex-1 p-6 overflow-y-auto space-y-3"
                    onScroll={(e) => {
                        console.log("ScrollTop:", e.target.scrollTop);

                        if (
                            e.target.scrollTop === 0 &&
                            hasMore
                        ) {
                            console.log("Loading next page...");
                            if (e.target.scrollTop === 0 && hasMore && !loadingMessages) {
                                setLoadingMessages(true);
                                setPage((prev) => prev + 1);
                            }
                        }
                    }}
                >
                    {messages.length === 0 ? (
                        <p className="text-center text-gray-400 mt-10">
                            No messages yet.
                        </p>
                    ) : (
                        messages.map((msg) => (
                            <div
                                key={msg._id}
                                className={`flex ${msg.sender === currentUser._id
                                    ? "justify-end"
                                    : "justify-start"
                                    }`}
                            >
                                <div
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setReplyMessage(msg);
                                    }}
                                    className={`max-w-[70%] px-4 py-2 rounded-2xl ${msg.sender === currentUser._id
                                        ? "bg-blue-600 text-white"
                                        : "bg-white shadow"
                                        }`}
                                >
                                    {msg.replyTo && (
                                        <div className="border-l-4 border-blue-400 bg-gray-100 text-black rounded p-2 mb-2">
                                            <p className="text-xs font-semibold">
                                                {msg.replyTo.sender?._id === currentUser._id
                                                    ? "You"
                                                    : msg.replyTo.sender?.name}
                                            </p>

                                            <p className="text-sm truncate">
                                                {msg.replyTo.text
                                                    ? msg.replyTo.text
                                                    : msg.replyTo.image
                                                        ? "📷 Image"
                                                        : "🎤 Voice message"}
                                            </p>
                                        </div>
                                    )}
                                    {msg.image && (
                                        <img
                                            src={msg.image}
                                            alt="Shared"
                                            className="w-56 rounded-lg mb-2"
                                        />
                                    )}
                                    {msg.video && (
                                        <video
                                            controls
                                            className="w-64 rounded-lg mb-2"
                                        >
                                            <source src={msg.video} type="video/mp4" />
                                            Your browser does not support the video tag.
                                        </video>
                                    )}

                                    {msg.voice && (
                                        <audio
                                            controls
                                            src={msg.voice}
                                            className="w-64 mb-2"
                                        />
                                    )}

                                    {msg.text && <p>{msg.text}</p>}
                                    <p className="text-[10px] mt-1 opacity-70 text-right">
                                        {new Date(msg.createdAt).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                    {msg.sender === currentUser._id && (
                                        <>
                                            <div className="text-xs mt-2 text-right">
                                                {!msg.delivered ? (
                                                    <span className="text-green-400">✓ Sent</span>
                                                ) : !msg.seen ? (
                                                    <span className="text-black">✓✓ Delivered</span>
                                                ) : (
                                                    <span className="text-violet-400">✓✓ Seen</span>
                                                )}
                                            </div>

                                            <div className="relative mt-1">

                                                <button
                                                    onClick={() =>
                                                        setMenuOpen(menuOpen === msg._id ? null : msg._id)
                                                    }
                                                    className="text-gray-400 hover:text-white text-lg"
                                                >
                                                    ⋮
                                                </button>

                                                {menuOpen === msg._id && (
                                                    <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-lg z-50 min-w-[150px]">

                                                        <button
                                                            onClick={() => {
                                                                deleteMessage(msg._id);
                                                                setMenuOpen(null);
                                                            }}
                                                            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                                                        >
                                                            🗑️ Delete
                                                        </button>

                                                    </div>
                                                )}

                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef}></div>

                </div>
                {(selectedImage || selectedVideo) && (
                    <div className="bg-white border-t border-gray-200 px-5 py-3">

                        <div className="relative inline-block">

                            {selectedImage ? (
                                <img
                                    src={URL.createObjectURL(selectedImage)}
                                    alt="Preview"
                                    className="w-48 h-48 object-cover rounded-xl shadow"
                                />
                            ) : (
                                <video
                                    controls
                                    className="w-64 rounded-xl shadow"
                                >
                                    <source
                                        src={URL.createObjectURL(selectedVideo)}
                                        type={selectedVideo.type}
                                    />
                                </video>
                            )}

                            <button
                                onClick={() => {
                                    setSelectedImage(null);
                                    setSelectedVideo(null);

                                    if (fileInputRef.current) {
                                        fileInputRef.current.value = "";
                                    }
                                }}
                                className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center transition"
                            >
                                ✕
                            </button>

                        </div>

                        <p className="text-gray-500 text-sm mt-2">
                            Ready to send
                        </p>

                    </div>
                )}
                {showEmoji && (
                    <div className="absolute bottom-24 left-5 z-50">
                        <EmojiPicker
                            onEmojiClick={(emojiData) => {
                                setText((prev) => prev + emojiData.emoji);
                                setShowEmoji(false);
                            }}
                        />
                    </div>
                )}
                {audioBlobUrl && (
                    <div className="bg-gray-100 p-3 rounded-lg mx-4 mb-2 flex items-center gap-3">
                        <audio controls src={audioBlobUrl} className="flex-1"></audio>

                        <button
                            onClick={() => setAudioBlobUrl(null)}
                            className="text-red-500 font-bold"
                        >
                            ✕
                        </button>
                    </div>
                )}
                <div className="bg-white p-4 flex items-center gap-3 border-t shadow-sm">
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="text-2xl text-gray-600 hover:text-blue-600 transition"
                    >
                        <FiPaperclip />
                    </button>
                    <button
                        onClick={() => setShowEmoji(!showEmoji)}
                        className="text-2xl hover:text-yellow-500 transition"
                    >
                        😊
                    </button>
                    {replyMessage && (
                        <div className="bg-gray-100 border-l-4 border-blue-500 p-2 rounded mb-2 flex justify-between">
                            <div>
                                <p className="text-xs text-blue-600 font-semibold">
                                    Replying to {replyMessage.sender === currentUser._id ? "You" : selectedUser?.name}
                                </p>

                                <p className="text-sm">
                                    {replyMessage.text || "📷 Image"}
                                </p>
                            </div>

                            <button onClick={() => setReplyMessage(null)}>
                                ✕
                            </button>
                        </div>
                    )}
                    <input
                        type="text"
                        placeholder="Type your message..."
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);

                            if (!typingRef.current) {
                                typingRef.current = true;

                                socket.emit("typing", {
                                    senderId: currentUser._id,
                                    receiverId: selectedUser._id,
                                });
                            }

                            clearTimeout(typingTimeoutRef.current);

                            typingTimeoutRef.current = setTimeout(() => {
                                typingRef.current = false;

                                socket.emit("stopTyping", {
                                    senderId: currentUser._id,
                                    receiverId: selectedUser._id,
                                });
                            }, 1000);
                        }}
                        className="flex-1 border rounded-full px-5 py-3 outline-none focus:border-blue-600"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                sendMessage();
                            }
                        }}
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files[0];

                            console.log("Selected file:", file);

                            if (!file) return;

                            console.log("File type:", file.type);

                            if (file.type.startsWith("image")) {
                                console.log("📷 Image selected");
                                setSelectedImage(file);
                                setSelectedVideo(null);
                            } else if (file.type.startsWith("video")) {
                                console.log("🎥 Video selected");
                                setSelectedVideo(file);
                                setSelectedImage(null);
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            if (isRecording) {
                                stopRecording();
                            } else {
                                startRecording();
                            }
                        }}
                        className={`text-2xl ${isRecording ? "text-red-600" : "text-gray-500"
                            }`}
                    >
                        <FiMic />
                    </button>
                    <button
                        onClick={sendMessage}
                        className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full flex items-center justify-center transition shadow transition"
                    >
                        <FiSend size={20} />
                    </button>
                </div>

            </div>

            {/* =========================
                REMOTE CALL AUDIO
            ========================= */}

            <audio
                ref={remoteAudioRef}
                autoPlay
            />

        </div>
    );
}