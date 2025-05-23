require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const cors = require("cors");
const os = require("os");

const app = express();
const server = http.createServer(app);

// Fungsi untuk mendapatkan alamat IP lokal
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// CORS untuk komunikasi antar mesin
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests from any origin in development
      callback(null, true);
    },
    credentials: true,
  })
);

// Konfigurasi Socket.IO dengan CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 3000;

// Konfigurasi awal
const NODE_NAME =
  process.env.NODE_NAME || `node_${crypto.randomBytes(2).toString("hex")}`;
const AUTHORIZED_VALIDATORS = [
  "validator1",
  "validator2",
  "genesis",
  "node_alpha",
  "node_beta",
  NODE_NAME,
];
const NETWORK_NODES = new Set(); // Daftar node dalam jaringan

// Konfigurasi kriptografi
const ENCRYPTION_KEY = crypto.scryptSync("secret-key", "salt", 32); // Dalam produksi, gunakan key management yang proper
const IV_LENGTH = 16;

// Konfigurasi penyimpanan
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "node_data", NODE_NAME, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      Date.now() +
        "-" +
        crypto.randomBytes(4).toString("hex") +
        "-" +
        file.originalname
    );
  },
});

const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// ----------------------------
// Enhanced Crypto Functions
// ----------------------------

function encryptData(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptData(text) {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift(), "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

// ----------------------------
// Enhanced Blockchain Classes
// ----------------------------

class Block {
  constructor(index, timestamp, documentData, previousHash, validator) {
    this.index = index;
    this.timestamp = timestamp;
    this.documentData = documentData;
    this.previousHash = previousHash;
    this.validator = validator;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
          this.previousHash +
          this.timestamp +
          JSON.stringify(this.documentData) +
          this.validator
      )
      .digest("hex");
  }

  static fromJSON(json) {
    return new Block(
      json.index,
      json.timestamp,
      json.documentData,
      json.previousHash,
      json.validator
    );
  }
}

class Blockchain {
  constructor(nodeName) {
    this.nodeName = nodeName;
    this.chain = [];
    this.pendingBlocks = [];
    this.loadFromFile();
    if (this.chain.length === 0) {
      this.chain.push(this.createGenesisBlock());
      this.saveToFile();
    }
  }

  createGenesisBlock() {
    return new Block(
      0,
      0,
      "Genesis Block - Document Validation System",
      "0",
      "genesis"
    );
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  async addBlock(newBlock) {
    if (!this.validateBlock(newBlock)) {
      throw new Error("Invalid block");
    }

    this.chain.push(newBlock);
    this.saveToFile();

    // Broadcast to network via socket
    this.broadcastBlock(newBlock);
  }

  validateBlock(newBlock) {
    const latestBlock = this.getLatestBlock();

    // Pengecualian untuk genesis block
    if (newBlock.index === 0) {
      return newBlock.validator === "genesis" && newBlock.previousHash === "0";
    }

    // Validasi normal
    const isHashValid = newBlock.hash === newBlock.calculateHash();
    const isPrevHashValid = newBlock.previousHash === latestBlock.hash;
    const isValidatorValid = AUTHORIZED_VALIDATORS.includes(newBlock.validator);

    console.log(`[DEBUG] Block validation results:
    - Hash Valid: ${isHashValid}
    - Previous Hash Valid: ${isPrevHashValid}
    - Validator Valid: ${isValidatorValid}`);

    return isHashValid && isPrevHashValid && isValidatorValid;
  }

  broadcastBlock(block) {
    const blockData = {
      index: block.index,
      timestamp: block.timestamp,
      documentData: block.documentData,
      previousHash: block.previousHash,
      validator: block.validator,
      hash: block.hash,
    };

    io.emit("new-block", blockData);
    console.log(`[SOCKET] Block ${block.index} broadcasted to network`);
  }

  saveToFile() {
    const data = JSON.stringify(this.chain, null, 2);
    const dir = path.join(__dirname, "node_data", this.nodeName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, "blockchain.json"), data);
  }

  loadFromFile() {
    const filePath = path.join(
      __dirname,
      "node_data",
      this.nodeName,
      "blockchain.json"
    );
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      const parsedData = JSON.parse(data);

      this.chain = parsedData.map((block) => {
        if (block instanceof Block) return block;
        return Block.fromJSON(block);
      });
    }
  }

  async resolveConflicts() {
    let maxLength = this.chain.length;
    let newChain = null;

    for (const node of NETWORK_NODES) {
      if (
        node !== `http://localhost:${port}` &&
        node !== `http://${getLocalIpAddress()}:${port}`
      ) {
        try {
          const response = await axios.get(`${node}/blocks`);
          const receivedChain = response.data.map((block) =>
            Block.fromJSON(block)
          );

          if (
            receivedChain.length > maxLength &&
            this.validateChain(receivedChain)
          ) {
            maxLength = receivedChain.length;
            newChain = receivedChain;
          }
        } catch (err) {
          console.error(`Error checking node ${node}:`, err.message);
        }
      }
    }

    if (newChain) {
      this.chain = newChain;
      this.saveToFile();
      return true;
    }
    return false;
  }

  validateChain(chain) {
    // First convert all blocks to Block instances if they aren't already
    const convertedChain = chain.map((block) => {
      if (block instanceof Block) return block;
      return Block.fromJSON(block);
    });

    for (let i = 1; i < convertedChain.length; i++) {
      const currentBlock = convertedChain[i];
      const previousBlock = convertedChain[i - 1];

      if (typeof currentBlock.calculateHash !== "function") {
        console.error("Invalid block - calculateHash missing", currentBlock);
        return false;
      }

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        console.error("Invalid block hash", {
          index: currentBlock.index,
          calculatedHash: currentBlock.calculateHash(),
          storedHash: currentBlock.hash,
        });
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error("Invalid previous hash", {
          index: currentBlock.index,
          currentPreviousHash: currentBlock.previousHash,
          actualPreviousHash: previousBlock.hash,
        });
        return false;
      }

      if (!AUTHORIZED_VALIDATORS.includes(currentBlock.validator)) {
        console.error("Invalid validator", currentBlock.validator);
        return false;
      }
    }
    return true;
  }
}

// Inisialisasi blockchain
const docChain = new Blockchain(NODE_NAME);

// Fungsi untuk mendaftarkan dengan node lain
async function registerWithNode(targetNodeUrl) {
  try {
    // Daftarkan node ini ke node target
    const myUrl = `http://${getLocalIpAddress()}:${port}`;
    const response = await axios.post(`${targetNodeUrl}/register-node`, {
      nodeUrl: myUrl,
    });
    console.log(`[HTTP] Registered with node: ${targetNodeUrl}`);

    // Tambahkan semua node dari jaringan
    if (response.data && response.data.nodes) {
      response.data.nodes.forEach((node) => {
        if (!NETWORK_NODES.has(node)) {
          NETWORK_NODES.add(node);
          console.log(`[NETWORK] Added node from response: ${node}`);
        }
      });
    }

    return true;
  } catch (error) {
    console.error(
      `[ERROR] Failed to register with ${targetNodeUrl}:`,
      error.message
    );
    return false;
  }
}

// ----------------------------
// Modified Socket.io Implementation
// ----------------------------

// Track active connections
const activeConnections = new Map();

io.on("connection", (socket) => {
  console.log(`[SOCKET] New connection from ${socket.id}`);

  // Store the connection
  activeConnections.set(socket.id, {
    connectionTime: new Date(),
    lastActivity: new Date(),
  });

  // Handle page navigation tracking
  socket.on("page_view", (page) => {
    console.log(`[SOCKET] Client ${socket.id} navigated to: ${page}`);
    if (activeConnections.has(socket.id)) {
      const connection = activeConnections.get(socket.id);
      connection.lastActivity = new Date();
      connection.currentPage = page;
      activeConnections.set(socket.id, connection);
    }
  });

  socket.on("register-node", (data) => {
    const nodeUrl = data.nodeUrl;
    if (nodeUrl && !NETWORK_NODES.has(nodeUrl)) {
      NETWORK_NODES.add(nodeUrl);
      console.log(`[SOCKET] Node registered: ${nodeUrl}`);

      io.emit("network-update", Array.from(NETWORK_NODES));
      io.emit("node-registered", nodeUrl);
    }
  });

  socket.on("new-block", (blockData) => {
    console.log(`[SOCKET] Received new block from network: ${blockData.index}`);

    const newBlock = new Block(
      blockData.index,
      blockData.timestamp,
      blockData.documentData,
      blockData.previousHash,
      blockData.validator
    );

    try {
      if (docChain.validateBlock(newBlock)) {
        // Cek apakah blok sudah ada (cegah duplikat)
        const blockExists = docChain.chain.some(
          (block) => block.hash === newBlock.hash
        );

        if (!blockExists) {
          docChain.chain.push(newBlock);
          docChain.saveToFile();
          console.log("[SOCKET] Block added successfully:", newBlock.index);
        } else {
          console.log(
            "[SOCKET] Block already exists, skipping:",
            newBlock.index
          );
        }
      } else {
        console.error("[SOCKET] Invalid block received:", newBlock);
      }
    } catch (err) {
      console.error("[SOCKET] Error processing block:", err);
    }
  });

  socket.on("chain-response", (chain) => {
    try {
      const convertedChain = chain.map((blockData) =>
        Block.fromJSON(blockData)
      );

      if (
        convertedChain.length > docChain.chain.length &&
        docChain.validateChain(convertedChain)
      ) {
        docChain.chain = convertedChain;
        docChain.saveToFile();
        console.log("[SOCKET] Chain synchronized from bootstrap node");
      }
    } catch (error) {
      console.error("[SOCKET] Error processing chain response:", error);
    }
  });

  socket.on("request-chain", () => {
    socket.emit("chain-response", docChain.chain);
  });

  socket.on("disconnect", () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    activeConnections.delete(socket.id);
  });
});

// ----------------------------
// Enhanced Routes
// ----------------------------

app.post("/register-node", (req, res) => {
  const newNodeUrl = req.body.nodeUrl;

  if (!newNodeUrl || typeof newNodeUrl !== "string") {
    return res.status(400).json({ error: "Invalid node URL" });
  }

  if (!NETWORK_NODES.has(newNodeUrl)) {
    NETWORK_NODES.add(newNodeUrl);
    console.log(`[HTTP] Node registered: ${newNodeUrl}`);
    io.emit("node-registered", newNodeUrl);
  }

  res.json({
    message: "Node registered successfully",
    nodes: Array.from(NETWORK_NODES),
  });
});

app.post("/sync-nodes", (req, res) => {
  const nodes = req.body.nodes;
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => {
      if (typeof node === "string" && !NETWORK_NODES.has(node)) {
        NETWORK_NODES.add(node);
      }
    });
  }
  res.json({ message: "Nodes synchronized", nodes: Array.from(NETWORK_NODES) });
});

app.get("/blocks", (req, res) => {
  res.json(docChain.chain);
});

app.get("/node-info", (req, res) => {
  res.json({
    nodeName: NODE_NAME,
    nodeUrl: `http://${getLocalIpAddress()}:${port}`,
    status: "Connected",
    nodes: Array.from(NETWORK_NODES),
  });
});

app.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verify.html"));
});

app.post("/addDocument", upload.single("document"), async (req, res) => {
  try {
    const { documentId, title, issuer, recipient, issueDate } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).send("No file uploaded");
    }

    const encryptedPath = encryptData(uploadedFile.path);

    const record = {
      documentId,
      title,
      issuer,
      recipient,
      issueDate,
      documentHash: calculateFileHash(uploadedFile.path),
      filePath: encryptedPath,
      verificationStatus: true,
    };

    const newBlock = new Block(
      docChain.chain.length,
      Date.now(),
      record,
      docChain.getLatestBlock().hash,
      NODE_NAME
    );

    await docChain.addBlock(newBlock);
    res.redirect("/documents");
  } catch (error) {
    console.error("Error adding document:", error);
    res.status(500).send("Error processing document");
  }
});

app.get("/documents", (req, res) => {
  let documentsHTML = `<h2>Blockchain Document Records (Node: ${NODE_NAME})</h2>`;

  docChain.chain.forEach((block, i) => {
    if (i === 0) return;

    const decryptedPath = decryptData(block.documentData.filePath);
    const fileExists = fs.existsSync(decryptedPath);

    documentsHTML += `
      <div class="document-card">
        <h3>Document #${block.documentData.documentId}</h3>
        <div class="document-details">
          <p><strong>Title:</strong> ${block.documentData.title}</p>
          <p><strong>Issuer:</strong> ${block.documentData.issuer}</p>
          <p><strong>Recipient:</strong> ${block.documentData.recipient}</p>
          <p><strong>Issue Date:</strong> ${block.documentData.issueDate}</p>
          <p><strong>Validator:</strong> ${block.validator}</p>
          <p><strong>File Exists:</strong> ${fileExists ? "Yes" : "No"}</p>
          <p><strong>Document Hash:</strong> <span class="hash">${
            block.documentData.documentHash
          }</span></p>
          <p><strong>Block Hash:</strong> <span class="hash">${
            block.hash
          }</span></p>
        </div>
      </div>
    `;
  });

  res.send(`
    <!DOCTYPE html>
    <html>
     <head>
      <meta charset="UTF-8">
      <title>Document Verification Result</title>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="/css/style.css" rel="stylesheet">
      <script src="/socket.io/socket.io.js"></script>
      <script src="/js/socket-handler.js"></script>
    </head>
    <nav aria-label="Main navigation">
    <div class="logo">BlockDoc</div>
    <div>
      <a href="/">Home</a>
      <a href="/documents">Dokumen</a>
      <a href="/verify">Verifikasi</a>
      <a href="/network">Jaringan</a>
    </div>
  </nav>
  
  <header>
    <div class="header-content">
      <h1>Sistem Validasi Dokumen Blockchain</h1>
      <p>Keamanan dan Keaslian Dokumen dengan Teknologi Blockchain</p>
    </div>
  </header>
    <body>
      <div class="container">
        ${documentsHTML}
        <div class="node-info">
          <h3>Node Information</h3>
          <p><strong>Node Name:</strong> ${NODE_NAME}</p>
          <p><strong>Node URL:</strong> http://${getLocalIpAddress()}:${port}</p>
          <p><strong>Connected Nodes:</strong> ${Array.from(NETWORK_NODES).join(
            ", "
          )}</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Route untuk verifikasi dokumen
app.post("/verifyDocument", upload.single("document"), async (req, res) => {
  try {
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).send("No file uploaded");
    }

    // Hitung hash dari file yang diupload
    const documentHash = calculateFileHash(uploadedFile.path);

    // Cari dokumen dengan hash yang sama di blockchain
    const foundBlock = docChain.chain.find(
      (block) =>
        block.documentData && block.documentData.documentHash === documentHash
    );

    // Hapus file yang diupload setelah selesai verifikasi
    fs.unlinkSync(uploadedFile.path);

    let resultHTML = `<h2>Hasil Verifikasi Dokumen</h2>`;

    if (foundBlock) {
      resultHTML += `
        <div class="verification-result success">
          <div class="icon">✓</div>
          <h3>Dokumen Terverifikasi</h3>
          <p>Dokumen ini valid dan ditemukan di blockchain.</p>
          
          <div class="document-details">
            <p><strong>ID Dokumen:</strong> ${
              foundBlock.documentData.documentId
            }</p>
            <p><strong>Judul:</strong> ${foundBlock.documentData.title}</p>
            <p><strong>Penerbit:</strong> ${foundBlock.documentData.issuer}</p>
            <p><strong>Penerima:</strong> ${
              foundBlock.documentData.recipient
            }</p>
            <p><strong>Tanggal Penerbitan:</strong> ${
              foundBlock.documentData.issueDate
            }</p>
            <p><strong>Ditambahkan ke Blockchain:</strong> ${new Date(
              foundBlock.timestamp
            ).toLocaleString()}</p>
            <p><strong>Hash Dokumen:</strong> <span class="hash">${
              foundBlock.documentData.documentHash
            }</span></p>
          </div>
        </div>
      `;
    } else {
      resultHTML += `
        <div class="verification-result failure">
          <div class="icon">✗</div>
          <h3>Dokumen Tidak Terverifikasi</h3>
          <p>Dokumen ini tidak ditemukan di blockchain.</p>
          <p>Hash Dokumen: <span class="hash">${documentHash}</span></p>
        </div>
      `;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Hasil Verifikasi Dokumen</title>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="/css/style.css">
        <script src="/socket.io/socket.io.js"></script>
        <script src="/js/socket-handler.js"></script>
      </head>
      <body>
        <nav aria-label="Main navigation">
          <div class="logo">BlockDoc</div>
          <div>
            <a href="/">Home</a>
            <a href="/documents">Dokumen</a>
            <a href="/verify">Verifikasi</a>
            <a href="/network">Jaringan</a>
          </div>
        </nav>
        
        <header>
          <div class="header-content">
            <h1>Sistem Validasi Dokumen Blockchain</h1>
            <p>Keamanan dan Keaslian Dokumen dengan Teknologi Blockchain</p>
          </div>
        </header>
        
        <div class="container">
          ${resultHTML}
          <div class="nav-links">
            <a href="/">Tambah Dokumen Baru</a> | 
            <a href="/verify">Verifikasi Dokumen Lain</a> |
            <a href="/documents">Lihat Semua Dokumen</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error verifying document:", error);
    res.status(500).send("Error verifying document");
  }
});

app.post("/verifyDocumentById", (req, res) => {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).send("ID dokumen tidak boleh kosong");
    }

    // Cari dokumen dengan ID yang sesuai di blockchain
    const foundBlock = docChain.chain.find(
      (block) =>
        block.documentData && block.documentData.documentId === documentId
    );

    let resultHTML = `<h2>Hasil Verifikasi Dokumen</h2>`;

    if (foundBlock) {
      resultHTML += `
        <div class="verification-result success">
          <div class="icon">✓</div>
          <h3>Dokumen Terverifikasi</h3>
          <p>Dokumen dengan ID <strong>${documentId}</strong> ditemukan di blockchain.</p>
          
          <div class="document-details">
            <p><strong>Judul:</strong> ${foundBlock.documentData.title}</p>
            <p><strong>Penerbit:</strong> ${foundBlock.documentData.issuer}</p>
            <p><strong>Penerima:</strong> ${
              foundBlock.documentData.recipient
            }</p>
            <p><strong>Tanggal Penerbitan:</strong> ${
              foundBlock.documentData.issueDate
            }</p>
            <p><strong>Ditambahkan ke Blockchain:</strong> ${new Date(
              foundBlock.timestamp
            ).toLocaleString()}</p>
            <p><strong>Hash Dokumen:</strong> <span class="hash">${
              foundBlock.documentData.documentHash
            }</span></p>
          </div>
        </div>
      `;
    } else {
      resultHTML += `
        <div class="verification-result failure">
          <div class="icon">✗</div>
          <h3>Dokumen Tidak Terverifikasi</h3>
          <p>Dokumen dengan ID <strong>${documentId}</strong> tidak ditemukan di blockchain.</p>
        </div>
      `;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Hasil Verifikasi Dokumen</title>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="/css/style.css">
        <script src="/socket.io/socket.io.js"></script>
        <script src="/js/socket-handler.js"></script>
      </head>
      <body>
        <nav aria-label="Main navigation">
          <div class="logo">BlockDoc</div>
          <div>
            <a href="/">Home</a>
            <a href="/documents">Dokumen</a>
            <a href="/verify">Verifikasi</a>
            <a href="/network">Jaringan</a>
          </div>
        </nav>
        
        <header>
          <div class="header-content">
            <h1>Sistem Validasi Dokumen Blockchain</h1>
            <p>Keamanan dan Keaslian Dokumen dengan Teknologi Blockchain</p>
          </div>
        </header>
        
        <div class="container">
          ${resultHTML}
          <div class="nav-links">
            <a href="/">Tambah Dokumen Baru</a> | 
            <a href="/verify">Verifikasi Dokumen Lain</a> |
            <a href="/documents">Lihat Semua Dokumen</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error verifying document by ID:", error);
    res.status(500).send("Error verifying document by ID");
  }
});

// Route untuk halaman network
app.get("/network", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "network.html"));
});

app.get("/network/nodes", (req, res) => {
  res.json({
    currentNode: `http://${getLocalIpAddress()}:${port}`,
    nodeName: NODE_NAME,
    nodes: Array.from(NETWORK_NODES),
  });
});

// Endpoint untuk mendapatkan daftar node
app.get("/nodes", (req, res) => {
  res.json(Array.from(NETWORK_NODES));
});

// Endpoint ping untuk memeriksa ketersediaan node
app.get("/ping", (req, res) => {
  res.json({
    status: "online",
    node: NODE_NAME,
    nodeUrl: `http://${getLocalIpAddress()}:${port}`,
    timestamp: Date.now(),
  });
});

server.listen(port, async () => {
  const myIp = getLocalIpAddress();
  const myUrl = `http://${myIp}:${port}`;
  console.log(`Node ${NODE_NAME} running at ${myUrl}`);

  // Add own URL to network nodes
  NETWORK_NODES.add(myUrl);

  // Connect to bootstrap node if specified
  if (process.env.BOOTSTRAP_NODE) {
    try {
      console.log(
        `Connecting to bootstrap node: ${process.env.BOOTSTRAP_NODE}`
      );

      // Register with the bootstrap node via HTTP first
      await registerWithNode(process.env.BOOTSTRAP_NODE);

      // Then establish socket connection
      const socket = require("socket.io-client")(process.env.BOOTSTRAP_NODE);

      socket.on("connect", () => {
        console.log(
          `[SOCKET] Connected to bootstrap node: ${process.env.BOOTSTRAP_NODE}`
        );
        socket.emit("register-node", { nodeUrl: myUrl });
        socket.emit("request-chain");
      });

      // Rest of your socket event handlers...
    } catch (err) {
      console.log("Error connecting to bootstrap node:", err.message);
    }
  }
});
