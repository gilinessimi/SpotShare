"use client";

import { useEffect, useState, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

interface Spot {
  id: number;
  name: string;
  status: 'free' | 'taken';
}

interface ChatMessage {
  id: number;
  text: string;
  sender: string;
  isSelf?: boolean;
}

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const [p2pMessages, setP2pMessages] = useState<ChatMessage[]>([]);
  const [p2pInput, setP2pInput] = useState('');
  const [p2pStatus, setP2pStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('initSpots', (initialSpots: Spot[]) => setSpots(initialSpots));
    newSocket.on('updateSpots', (updatedSpots: Spot[]) => setSpots(updatedSpots));
    newSocket.on('chatMessage', (msg: ChatMessage) => {
      setChat((prev) => [...prev, { ...msg, isSelf: msg.sender === newSocket.id }]);
    });

    newSocket.on('webrtc_offer', async (offer) => {
      setP2pStatus('connecting');
      initPeerConnection(newSocket);
      await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current?.createAnswer();
      await peerConnection.current?.setLocalDescription(answer);
      newSocket.emit('webrtc_answer', answer);
    });

    newSocket.on('webrtc_answer', async (answer) => {
      await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    newSocket.on('webrtc_ice_candidate', async (candidate) => {
      if (candidate) {
        await peerConnection.current?.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => { newSocket.disconnect(); };
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chat]);

  const initPeerConnection = (socketInstance: Socket) => {
    if (peerConnection.current) return;
    
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketInstance.emit('webrtc_ice_candidate', event.candidate);
      }
    };

    peerConnection.current.ondatachannel = (event) => {
      const receiveChannel = event.channel;
      receiveChannel.onopen = () => setP2pStatus('connected');
      receiveChannel.onclose = () => setP2pStatus('disconnected');
      receiveChannel.onmessage = (e) => {
        setP2pMessages((prev) => [...prev, { id: Date.now(), text: e.data, sender: 'Peer', isSelf: false }]);
      };
      dataChannel.current = receiveChannel;
    };
  };

  const startP2PConnection = async () => {
    if (!socket) return;
    setP2pStatus('connecting');
    initPeerConnection(socket);
    
    dataChannel.current = peerConnection.current!.createDataChannel('chat');
    dataChannel.current.onopen = () => setP2pStatus('connected');
    dataChannel.current.onclose = () => setP2pStatus('disconnected');
    dataChannel.current.onmessage = (e) => {
      setP2pMessages((prev) => [...prev, { id: Date.now(), text: e.data, sender: 'Peer', isSelf: false }]);
    };

    const offer = await peerConnection.current!.createOffer();
    await peerConnection.current!.setLocalDescription(offer);
    socket.emit('webrtc_offer', offer);
  };

  const sendP2PMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (dataChannel.current && dataChannel.current.readyState === 'open' && p2pInput.trim()) {
      dataChannel.current.send(p2pInput);
      setP2pMessages((prev) => [...prev, { id: Date.now(), text: p2pInput, sender: 'Me', isSelf: true }]);
      setP2pInput('');
    }
  };

  const toggleSpot = (id: number) => {
    if (socket) socket.emit('toggleSpot', id);
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && chatInput.trim()) {
      socket.emit('chatMessage', chatInput);
      setChatInput('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800 selection:bg-indigo-100" dir="rtl">
      
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-10 text-center">
        <div className="inline-block px-4 py-1 mb-4 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-sm tracking-wide shadow-sm">
          טכנולוגיות אינטרנט מתקדמות - פרויקט גמר
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-3">
          Spot<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-500">Share</span>
        </h1>
        <p className="text-lg text-slate-500 font-medium">ניהול משאבים וסנכרון חניות בזמן אמת</p>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Parking Spots Grid */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-800">סטטוס עמדות</h2>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-slate-500">Live Sync</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 flex-1">
            {spots.map((spot) => (
              <button
                key={spot.id}
                onClick={() => toggleSpot(spot.id)}
                className={`group relative flex flex-col items-center justify-center p-8 rounded-xl transition-all duration-300 ${
                  spot.status === 'free' 
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-100' 
                  : 'bg-rose-50 hover:bg-rose-100 border-2 border-rose-200 hover:border-rose-400 hover:shadow-lg hover:shadow-rose-100'
                }`}
              >
                <div className={`text-4xl mb-3 transition-transform duration-300 group-hover:scale-110 ${spot.status === 'free' ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {spot.status === 'free' ? 'P' : '🚫'}
                </div>
                <span className="text-xl font-bold text-slate-700 mb-1">{spot.name}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${spot.status === 'free' ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'}`}>
                  {spot.status === 'free' ? 'פנוי' : 'תפוס'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Global Chat */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col h-[500px]">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"></path></svg>
            צ'אט מרכזי (Socket.io)
          </h2>
          
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto mb-4 p-4 rounded-xl bg-slate-50 space-y-3">
            {chat.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.isSelf ? 'items-start' : 'items-end'}`}>
                <span className="text-xs text-slate-400 mb-1 px-1">{msg.isSelf ? 'אני' : msg.sender.substring(0,4)}</span>
                <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${
                  msg.isSelf 
                  ? 'bg-indigo-500 text-white rounded-tr-none' 
                  : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {chat.length === 0 && <div className="text-center text-slate-400 text-sm mt-10">אין הודעות עדיין...</div>}
          </div>

          <form onSubmit={sendChatMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="הקלד הודעה לכולם..."
            />
            <button type="submit" className="bg-indigo-500 text-white px-5 py-2 rounded-xl font-medium hover:bg-indigo-600 transition-colors shadow-sm hover:shadow-md">
              שלח
            </button>
          </form>
        </div>

        {/* P2P Section */}
        <div className="lg:col-span-3 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-lg p-6 md:p-8 mt-2 text-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-700 pb-4 mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
                ערוץ תקשורת ישיר (WebRTC)
                {p2pStatus === 'connected' && <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full border border-emerald-500/30">מחובר</span>}
                {p2pStatus === 'connecting' && <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full border border-amber-500/30 animate-pulse">מתחבר...</span>}
              </h2>
              <p className="text-slate-400 text-sm">העברת הודעות Peer-to-Peer ללא תיווך השרת (DataChannel)</p>
            </div>
            
            <button 
              onClick={startP2PConnection}
              disabled={p2pStatus === 'connected'}
              className="bg-cyan-500 text-slate-900 px-6 py-2.5 rounded-xl font-bold hover:bg-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/30"
            >
              יצירת חיבור ישיר
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-950/50 h-48 overflow-y-auto p-4 rounded-xl border border-slate-700 flex flex-col space-y-3">
              {p2pMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.isSelf ? 'justify-start' : 'justify-end'}`}>
                  <div className={`px-4 py-2 rounded-xl text-sm ${
                    msg.isSelf 
                    ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30 rounded-tr-none' 
                    : 'bg-slate-700 text-white rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {p2pMessages.length === 0 && <div className="text-center text-slate-500 text-sm mt-10">התחבר כדי להתחיל צ'אט P2P</div>}
            </div>
            
            <form onSubmit={sendP2PMessage} className="flex flex-col justify-end gap-3">
              <input
                type="text"
                value={p2pInput}
                onChange={(e) => setP2pInput(e.target.value)}
                disabled={p2pStatus !== 'connected'}
                className="bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-500 transition-all text-white placeholder-slate-500 disabled:opacity-50"
                placeholder={p2pStatus === 'connected' ? "הודעה מוצפנת קצה-לקצה..." : "ממתין לחיבור..."}
              />
              <button 
                type="submit"
                disabled={p2pStatus !== 'connected'}
                className="bg-slate-100 text-slate-900 px-4 py-3 rounded-xl font-bold hover:bg-white transition-all disabled:opacity-50 shadow-md"
              >
                שלח הודעת P2P
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}