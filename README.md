# Blockchain Document Verification System

Aplikasi ini adalah sistem validasi dokumen berbasis blockchain yang memungkinkan pengguna untuk mengunggah, memverifikasi, dan melacak keaslian dokumen menggunakan teknologi blockchain. Setiap dokumen yang diunggah akan disimpan dalam blok yang terhubung dalam rantai (chain), memastikan keamanan dan integritas data.

---

## Fitur Utama
1. **Upload Dokumen**: Pengguna dapat mengunggah dokumen beserta metadata (ID dokumen, judul, penerbit, penerima, dan tanggal penerbitan).
2. **Verifikasi Dokumen**: Pengguna dapat memverifikasi keaslian dokumen dengan membandingkan hash dokumen dengan hash yang tersimpan di blockchain.
3. **Lihat Dokumen**: Menampilkan daftar semua dokumen yang telah diunggah beserta detailnya.

---

## Teknologi yang Digunakan
- **Node.js**: Runtime environment untuk menjalankan aplikasi.
- **Express.js**: Framework untuk membangun API dan server.
- **Multer**: Untuk menangani upload file.
- **Crypto**: Untuk enkripsi, dekripsi, dan perhitungan hash.
- **Axios**: Untuk komunikasi antar node dalam jaringan.

---

## Penerapan Blockchain
Aplikasi ini menggunakan konsep blockchain sederhana dengan fitur berikut:
1. **Genesis Block**: Blok pertama yang dibuat saat blockchain diinisialisasi.
2. **Validasi Blok**: Setiap blok baru divalidasi sebelum ditambahkan ke chain.
3. **Immutability**: Data dalam blok tidak dapat diubah karena hash blok tergantung pada data dan hash blok sebelumnya.
4. **Desentralisasi**: Beberapa node dapat berpartisipasi dalam jaringan dan menyebarkan blok baru.
5. **Konsensus Sederhana**: Menggunakan model Proof of Authority (hanya validator terdaftar yang bisa membuat blok).

---

## Cara Menjalankan Aplikasi

### Prasyarat
- **Node.js**: Pastikan Node.js sudah terinstal di sistem Anda.
- **NPM**: Package manager untuk menginstal dependensi.

### Langkah 1: Clone Repository
Clone repository ini ke lokal mesin Anda:
```bash
git clone https://github.com/Afdally/document-verify-blockchain.git
cd document-verify-blockchain
```

### Langkah 2: Instal Dependensi
Instal semua dependensi yang diperlukan:
```bash
npm install
```

### Langkah 3: Jalankan Node
#### a. **Node 1 (Validator1 - Port Default)**
Jalankan node pertama di port default (3000):
```bash
set NODE_NAME=validator1&& node app.js
```

#### b. **Node 2 (Validator2 - Port 3001)**
Jalankan node kedua di port 3001:
```bash
set NODE_NAME=validator2&& set PORT=3001&& node app.js
```

### Langkah 4: Daftarkan Node ke Jaringan
Daftarkan Node 2 ke Node 1:
```bash
curl -X POST -H "Content-Type: application/json" -d "{\"nodeUrl\":\"http://localhost:3001\"}" http://localhost:3000/register-node
```

Daftarkan Node 1 ke Node 2:
```bash
curl -X POST -H "Content-Type: application/json" -d "{\"nodeUrl\":\"http://localhost:3000\"}" http://localhost:3001/register-node
```

### Langkah 5: Akses Aplikasi
- **Node 1**: Buka browser dan akses `http://localhost:3000`.
- **Node 2**: Buka browser dan akses `http://localhost:3001`.

---

# Penjelasan Blockchain dalam Aplikasi Ini
### 1. **Genesis Block**
Genesis block adalah blok pertama yang dibuat saat blockchain diinisialisasi. Blok ini memiliki:
- `index: 0`
- `previousHash: "0"`
- `validator: "genesis"`

### 2. **Validasi Blok**
Setiap blok baru divalidasi sebelum ditambahkan ke chain. Validasi meliputi:
- Hash blok harus valid.
- `previousHash` harus match dengan hash blok terakhir.
- Validator harus terdaftar di `AUTHORIZED_VALIDATORS`.

### 3. **Immutability**
Data dalam blok tidak dapat diubah karena hash blok tergantung pada data dan hash blok sebelumnya. Jika ada perubahan, hash blok akan berubah, dan chain menjadi tidak valid.

### 4. **Desentralisasi**
Beberapa node dapat berpartisipasi dalam jaringan dan menyebarkan blok baru. Setiap node memiliki salinan chain yang independen.

### 5. **Konsensus**
Aplikasi ini menggunakan model Proof of Authority, di mana hanya validator terdaftar yang bisa membuat blok.

---

## Catatan
- Pastikan folder `node_data` dihapus jika ingin memulai chain dari awal.
- Gunakan environment variable untuk mengatur `NODE_NAME` dan `PORT` saat menjalankan node.

