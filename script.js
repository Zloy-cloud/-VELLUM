// ВСТАВЬ СВОЙ BACKEND URL
const API = "https://my-messenger-7pn7.onrender.com";

let token = null;
let currentUser = null;
let socket = null;

let currentChat = null;
let currentChatPartner = null;

// WebRTC
let peer = null;
let localStream = null;
let inCallWith = null;

// ========== AUTH ==========

function register() {
    const username = document.getElementById("reg-username").value;
    const password = document.getElementById("reg-password").value;

    fetch(API + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
    .then(r => r.json())
    .then(d => {
        if (d.error) {
            alert("Error: " + d.error);
        } else {
            alert("Зарегистрирован! Теперь войдите.");
        }
    });
}

function login() {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
    .then(r => r.json())
    .then(d => {
        if (d.token) {
            token = d.token;
            currentUser = parseJwt(token);
            document.getElementById("menu-user-label").innerText =
                "@" + currentUser.username + " | ID: " + currentUser.id;
            initApp();
        } else {
            alert("Login failed: " + (d.error || "Unknown error"));
        }
    });
}

function logout() {
    token = null;
    currentUser = null;
    location.reload();
}

// ========== INIT APP ==========

function initApp() {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");

    socket = io(API);
    socket.emit("join", currentUser.id);

    socket.on("new_message", msg => {
        if (msg.chatId === currentChat) {
            addMessage(msg);
        }
    });

    // Сигналинг звонков
    socket.on("call_incoming", ({ from }) => {
        if (inCallWith) {
            socket.emit("call_end", { to: from });
            return;
        }
        inCallWith = from;
        showCallModal("Входящий звонок", "ID: " + from, true);
    });

    socket.on("call_offer", async ({ from, offer }) => {
        if (!peer) await createPeer(from);
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("call_answer", { to: from, answer });
    });

    socket.on("call_answer", async ({ from, answer }) => {
        if (!peer) return;
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("call_ice_candidate", async ({ from, candidate }) => {
        if (!peer) return;
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error(e);
        }
    });

    socket.on("call_end", ({ from }) => {
        endCallInternal("Звонок завершён");
    });

    loadChats();
}

// ========== MENU ==========

function toggleMenu() {
    const menu = document.getElementById("side-menu");
    const overlay = document.getElementById("menu-overlay");

    if (menu.classList.contains("open")) {
        menu.classList.remove("open");
        overlay.classList.remove("show");
    } else {
        menu.classList.add("open");
        overlay.classList.add("show");
    }
}

// ========== CHATS ==========

function loadChats() {
    fetch(API + "/chats", {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(chats => {
        const list = document.getElementById("chat-list");
        list.innerHTML = "";

        chats.forEach(c => {
            const div = document.createElement("div");
            div.className = "chat-item";

            const avatar = document.createElement("div");
            avatar.className = "chat-avatar-small";
            let label = "?";
            if (c.partner && c.partner.username) {
                label = c.partner.username[0].toUpperCase();
            }
            avatar.innerText = label;

            const textWrap = document.createElement("div");
            textWrap.className = "chat-item-text";

            let name = "Chat " + c.id;
            let idText = "";
            if (c.partner) {
                name = "@" + c.partner.username;
                idText = "ID: " + c.partner.id;
            }

            const nameEl = document.createElement("div");
            nameEl.className = "chat-item-name";
            nameEl.innerText = name;

            const idEl = document.createElement("div");
            idEl.className = "chat-item-id";
            idEl.innerText = idText;

            textWrap.appendChild(nameEl);
            textWrap.appendChild(idEl);

            div.appendChild(avatar);
            div.appendChild(textWrap);

            div.onclick = () => openChat(c.id, c.partner);
            list.appendChild(div);
        });
    });
}

function openChat(id, partner) {
    currentChat = id;
    currentChatPartner = partner || null;

    const nameEl = document.getElementById("chat-partner-name");
    const idEl = document.getElementById("chat-partner-id");
    const avatarEl = document.getElementById("chat-avatar");
    const callBtn = document.getElementById("call-btn");

    if (partner) {
        nameEl.innerText = "@" + partner.username;
        idEl.innerText = "ID: " + partner.id;
        callBtn.disabled = false;
        avatarEl.innerText = partner.username[0].toUpperCase();
    } else {
        nameEl.innerText = "Chat " + id;
        idEl.innerText = "";
        callBtn.disabled = true;
        avatarEl.innerText = "V";
    }

    fetch(API + "/messages/" + id, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(msgs => {
        const box = document.getElementById("messages");
        box.innerHTML = "";
        msgs.forEach(addMessage);
    });
}

function addMessage(msg) {
    const box = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "msg";

    if (currentUser && msg.sender === currentUser.id) {
        div.classList.add("me");
    }

    const author = document.createElement("div");
    author.className = "author";
    author.innerText = "ID: " + msg.sender;

    const text = document.createElement("div");
    text.className = "text";
    text.innerText = msg.text;

    div.appendChild(author);
    div.appendChild(text);

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function sendMessage() {
    if (!currentChat) {
        alert("Сначала выберите чат");
        return;
    }

    const input = document.getElementById("msg-input");
    const text = input.value;
    if (!text.trim()) return;

    socket.emit("send_message", {
        chatId: currentChat,
        sender: currentUser.id,
        text
    });

    input.value = "";
}

// ========== SEARCH USERS ==========

function searchUser() {
    const q = document.getElementById("search-query").value;
    if (!q.trim()) return;

    fetch(API + "/user/search?q=" + encodeURIComponent(q.trim()), {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(users => {
        const box = document.getElementById("search-results");
        box.innerHTML = "";

        if (users.length === 0) {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.innerText = "Ничего не найдено";
            box.appendChild(div);
            return;
        }

        users.forEach(u => {
            const div = document.createElement("div");
            div.className = "search-result-item";

            const avatar = document.createElement("div");
            avatar.className = "chat-avatar-small";
            avatar.innerText = u.username[0].toUpperCase();

            const textWrap = document.createElement("div");
            textWrap.className = "chat-item-text";

            const nameEl = document.createElement("div");
            nameEl.className = "chat-item-name";
            nameEl.innerText = "@" + u.username;

            const idEl = document.createElement("div");
            idEl.className = "chat-item-id";
            idEl.innerText = "ID: " + u.id;

            textWrap.appendChild(nameEl);
            textWrap.appendChild(idEl);

            div.appendChild(avatar);
            div.appendChild(textWrap);

            div.onclick = () => createChatWithUser(u.id);
            box.appendChild(div);
        });
    });
}

function createChatWithUser(id) {
    fetch(API + "/chat", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ partnerId: id })
    })
    .then(r => r.json())
    .then(chat => {
        loadChats();
        fetch(API + "/user/" + id, {
            headers: { "Authorization": "Bearer " + token }
        })
        .then(r => r.json())
        .then(u => {
            openChat(chat.id, { id: u.id, username: u.username, avatar: u.avatar });
        });
    });
}

// ========== ПРОФИЛИ ==========

function openMyProfile() {
    if (!currentUser) return;
    openUserProfile(currentUser.id, true);
}

function openCurrentPartnerProfile() {
    if (!currentChatPartner) return;
    openUserProfile(currentChatPartner.id, false);
}

function openUserProfile(userId, isMe) {
    fetch(API + "/user/" + userId, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(u => {
        const box = document.getElementById("profile-modal");
        box.classList.remove("hidden");

        const header = isMe ? "Мой профиль" : "Профиль пользователя";
        box.innerHTML = `
            <h2>${header}</h2>
            <p>@${u.username}</p>
            <p>ID: ${u.id}</p>
            <p>${u.premium ? "VELLUM+ user" : "Free user"}</p>
            <p>${u.bio || "Нет описания."}</p>
            ${isMe ? `
                <input id="new-username" placeholder="@username" value="@${u.username}">
                <input id="new-bio" placeholder="Bio" value="${u.bio || ""}">
                <input id="new-avatar" placeholder="Avatar URL" value="${u.avatar || ""}">
                <button onclick="saveProfile()">Сохранить</button>
            ` : ""}
            <button onclick="closeProfile()">Закрыть</button>
        `;
    });
}

function closeProfile() {
    document.getElementById("profile-modal").classList.add("hidden");
}

function saveProfile() {
    const username = document.getElementById("new-username").value;
    const bio = document.getElementById("new-bio").value;
    const avatar = document.getElementById("new-avatar").value;

    fetch(API + "/user/edit", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, bio, avatar })
    })
    .then(r => r.json())
    .then(d => {
        if (d.error) {
            alert("Error: " + d.error);
        } else {
            alert("Профиль обновлён");
            document.getElementById("menu-user-label").innerText =
                "@" + d.user.username + " | ID: " + d.user.id;
            openMyProfile();
        }
    });
}

// ========== CALL (audio only) ==========

async function createPeer(targetId) {
    inCallWith = targetId;
    peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peer.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("call_ice_candidate", {
                to: inCallWith,
                candidate: event.candidate
            });
        }
    };

    peer.ontrack = event => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play();
    };

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
}

function showCallModal(status, info, showAccept) {
    const modal = document.getElementById("call-modal");
    modal.classList.remove("hidden");
    document.getElementById("call-status").innerText = status;
    document.getElementById("call-user-info").innerText = info || "";
    document.getElementById("call-accept").style.display = showAccept ? "inline-block" : "none";
}

function hideCallModal() {
    document.getElementById("call-modal").classList.add("hidden");
}

async function startCall() {
    if (!currentChatPartner) {
        alert("Нет собеседника");
        return;
    }

    const targetId = currentChatPartner.id;
    await createPeer(targetId);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("call_start", { to: targetId });
    socket.emit("call_offer", { to: targetId, offer });

    showCallModal("Звонок...", "@" + currentChatPartner.username + " (ID: " + targetId + ")", false);
}

function acceptCall() {
    hideCallModal();
}

function endCall() {
    if (!inCallWith) {
        hideCallModal();
        return;
    }
    socket.emit("call_end", { to: inCallWith });
    endCallInternal("Звонок завершён");
}

function endCallInternal(statusText) {
    if (peer) {
        peer.close();
        peer = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    showCallModal(statusText, "", false);
    setTimeout(() => hideCallModal(), 800);
    inCallWith = null;
}

// ========== JWT ==========

function parseJwt(t) {
    return JSON.parse(atob(t.split('.')[1]));
}



