const API = "https://my-messenger-7pn7.onrender.com";
let token = null;
let currentChat = null;
let socket = null;

function register() {
    const username = document.getElementById("reg-username").value;
    const password = document.getElementById("reg-password").value;

    fetch(API + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    }).then(r => r.json()).then(d => {
        alert("Registered!");
    });
}

function login() {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    }).then(r => r.json()).then(d => {
        if (d.token) {
            token = d.token;
            initApp();
        } else {
            alert("Login failed");
        }
    });
}

function initApp() {
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    const user = parseJwt(token);
    socket = io(API);
    socket.emit("join", user.id);

    loadChats();

    socket.on("new_message", msg => {
        if (msg.chatId === currentChat) {
            addMessage(msg);
        }
    });
}

function loadChats() {
    fetch(API + "/chats", {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json()).then(chats => {
        const list = document.getElementById("chat-list");
        list.innerHTML = "";

        chats.forEach(c => {
            const div = document.createElement("div");
            div.innerText = "Chat " + c.id;
            div.onclick = () => openChat(c.id);
            list.appendChild(div);
        });
    });
}

function createChat() {
    const partnerId = document.getElementById("partner-id").value;

    fetch(API + "/chat", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ partnerId: Number(partnerId) })
    }).then(r => r.json()).then(chat => {
        loadChats();
    });
}

function openChat(id) {
    currentChat = id;

    fetch(API + "/messages/" + id, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json()).then(msgs => {
        const box = document.getElementById("messages");
        box.innerHTML = "";
        msgs.forEach(addMessage);
    });
}

function addMessage(msg) {
    const box = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "msg";
    div.innerText = msg.sender + ": " + msg.text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function sendMessage() {
    const text = document.getElementById("msg-input").value;
    const user = parseJwt(token);

    socket.emit("send_message", {
        chatId: currentChat,
        sender: user.id,
        text
    });

    document.getElementById("msg-input").value = "";
}

function parseJwt(t) {
    return JSON.parse(atob(t.split('.')[1]));
}

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

function logout() {
    token = null;
    location.reload();
}

