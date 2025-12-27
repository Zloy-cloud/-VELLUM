// ВСТАВЬ СЮДА СВОЙ URL BACKEND НА RENDER
// например: const API = "https://my-messenger-7pn7.onrender.com";
const API = "https://my-messenger-7pn7.onrender.com";

let token = null;
let currentChat = null;
let socket = null;
let currentUser = null;

// ====== АВТОРИЗАЦИЯ ======

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
            alert("Registered! Now login.");
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

// ====== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ======

function initApp() {
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    socket = io(API);
    socket.emit("join", currentUser.id);

    loadChats();

    socket.on("new_message", msg => {
        if (msg.chatId === currentChat) {
            addMessage(msg);
        }
    });
}

// ====== МЕНЮ ======

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

// ====== ЧАТЫ ======

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
            let title = "Chat " + c.id;
            if (c.partner && c.partner.username) {
                title = c.partner.username;
            }
            div.innerText = title;
            div.onclick = () => openChat(c.id, c.partner);
            list.appendChild(div);
        });
    });
}

function openChat(id, partner) {
    currentChat = id;

    const header = document.getElementById("chat-partner-name");
    if (partner && partner.username) {
        header.innerText = partner.username;
    } else {
        header.innerText = "Chat " + id;
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
    author.innerText = msg.sender;

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

    const text = document.getElementById("msg-input").value;
    if (!text.trim()) return;

    socket.emit("send_message", {
        chatId: currentChat,
        sender: currentUser.id,
        text
    });

    document.getElementById("msg-input").value = "";
}

// ====== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ПО USERNAME ======

function searchUser() {
    const name = document.getElementById("search-user").value;
    if (!name.trim()) return;

    fetch(API + "/user/search/" + encodeURIComponent(name), {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(users => {
        const box = document.getElementById("search-results");
        box.innerHTML = "";

        if (users.length === 0) {
            box.innerText = "Никого не найдено";
            return;
        }

        users.forEach(u => {
            const div = document.createElement("div");
            div.innerText = u.username + " (ID: " + u.id + ")";
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
        if (chat.id) {
            openChat(chat.id, chat.partner);
        }
    });
}

// ====== ПРОФИЛЬ ======

function openProfile() {
    if (!currentUser) return;

    fetch(API + "/user/" + currentUser.id, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(u => {
        const box = document.getElementById("profile");
        box.classList.remove("hidden");

        const avatar = u.avatar || "https://via.placeholder.com/80x80.png?text=V";

        box.innerHTML = `
            <img src="${avatar}" alt="avatar">
            <h2>${u.username}</h2>
            <p>${u.premium ? "VELLUM+" : "Free user"}</p>
            <p>${u.bio || "No bio yet."}</p>

            <input id="new-bio" placeholder="New bio" value="${u.bio || ""}">
            <input id="new-avatar" placeholder="Avatar URL" value="${u.avatar || ""}">
            <button onclick="saveProfile()">Save</button>
            <button onclick="closeProfile()">Close</button>
        `;
    });
}

function closeProfile() {
    document.getElementById("profile").classList.add("hidden");
}

function saveProfile() {
    const bio = document.getElementById("new-bio").value;
    const avatar = document.getElementById("new-avatar").value;

    fetch(API + "/user/edit", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ bio, avatar })
    })
    .then(r => r.json())
    .then(() => openProfile());
}

// ====== JWT PARSE ======

function parseJwt(t) {
    return JSON.parse(atob(t.split('.')[1]));
}

