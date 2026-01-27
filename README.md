# 🤖 Utero Interactive AI Avatar

**Utero Interactive AI** adalah sistem asisten virtual berbasis web yang dirancang khusus untuk merepresentasikan **PT Utero Kreatif Indonesia**. Sistem ini menghadirkan pengalaman interaksi yang unik di mana pengguna tidak mengetik, melainkan berbicara langsung (*Voice Interaction*) dengan Avatar Virtual.

Proyek ini dibangun menggunakan **Next.js** dan memanfaatkan **OpenRouter** sebagai agregator AI untuk mengakses model LLM canggih secara gratis dan efisien.

---

## ✨ Fitur Utama

- **🎙️ Voice-Only Interaction**: Tidak ada input chat teks. Sistem menggunakan **Speech-to-Text (STT)** untuk mendengar user dan **Text-to-Speech (TTS)** untuk menjawab.
- **🛡️ Strict Domain Guardrails**: AI hanya akan menjawab pertanyaan seputar PT Utero Kreatif Indonesia (Layanan, Portofolio, Budaya Kerja). Pertanyaan di luar topik (politik, cuaca, koding umum) akan ditolak secara otomatis.
- **🧠 Multi-Model AI Brain**: Mendukung pergantian "otak" AI secara dinamis menggunakan 4 model berbeda via OpenRouter.
- **🇮🇩 Full Indonesian Support**: Dioptimalkan untuk memahami dan merespons dalam Bahasa Indonesia yang natural.

---

## 🛠️ Tech Stack

- **Framework**: Next.js (React)
- **Language**: TypeScript
- **AI Provider**: OpenRouter API
- **Voice Processing**:
  - Input: Web Speech API (STT)
  - Output: Web Speech API / External TTS (TTS)
- **Styling**: Tailwind CSS

---

## 🚀 Alur Logika Sistem (System Flow)

Sistem ini menggabungkan interaksi suara dengan kecerdasan buatan yang dibatasi konteksnya.

1. **User Berbicara**: Frontend menangkap suara user dan mengubahnya menjadi teks (STT).
2. **Context Injection**: Teks user digabungkan dengan **System Prompt** rahasia yang berisi aturan ketat *"Hanya bahas Utero"*.
3. **AI Processing**: Backend mengirim request ke OpenRouter menggunakan model yang dipilih (Gemma, Mimo, Nemotron, atau Deepseek).
4. **Response Generation**: AI menjawab sesuai konteks atau menolak jika di luar topik.
5. **Avatar Speaks**: Jawaban teks dari AI dikonversi kembali menjadi suara (TTS) dan disinkronkan dengan animasi bibir Avatar.

---

## ⚙️ Konfigurasi & Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/username/utero-interactive-ai.git
cd utero-interactive-ai
```

### 2. Install Dependencies

```bash
npm install
# atau
yarn install
```

### 3. Setup Environment Variables

Buat file `.env.local` di root folder dan tambahkan API Key OpenRouter Anda:

```env
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxx
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 4. Jalankan Development Server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

---

## 🧠 AI Implementation Details

Bagian ini menjelaskan bagaimana kita membatasi AI agar hanya berbicara tentang Utero.

### A. Model yang Digunakan

Kita menggunakan satu endpoint OpenRouter namun mendukung switch ke 4 Model berikut:

| Model Name | ID OpenRouter | Kegunaan |
|------------|---------------|----------|
| **Google Gemma 3** | `google/gemma-3-27b-it:free` | Default. Stabil & cerdas. |
| **Xiaomi Mimo** | `xiaomi/mimo-v2-flash:free` | Respon sangat cepat (latency rendah). |
| **Nvidia Nemotron** | `nvidia/nemotron-3-nano-30b-a3b:free` | Akurasi teknis tinggi. |
| **Deepseek R1** | `deepseek/deepseek-r1-0528:free` | Logika kuat. |

### B. System Prompt (The Brain)

Logika pembatasan topik ada di file `client/src/constants/ai.ts`. Kita menggunakan teknik _System Prompting_ untuk mendoktrin AI.

```typescript
// client/src/constants/ai.ts

export const getSystemPrompt = () => {
    return `
    PERAN:
    Kamu adalah Virtual Representative resmi dari PT Utero Kreatif Indonesia (Creative Agency di Malang).
    
    ATURAN UTAMA (WAJIB DIPATUHI):
    1. FOKUS TOPIK: Kamu HANYA boleh menjawab pertanyaan yang berkaitan dengan PT Utero, desain grafis, branding, digital marketing, dan portofolio perusahaan.
    2. PEMBATASAN KETAT: Jika user bertanya hal di luar topik tersebut (misal: coding, politik, resep masakan, cuaca, curhat pribadi), kamu WAJIB MENOLAK menjawabnya.
    3. GAYA BAHASA: Gunakan Bahasa Indonesia yang sopan, profesional, namun ramah (seperti customer service agency kreatif).
    
    CARA MENOLAK (CONTOH):
    - User: "Buatkan saya kodingan React."
    - Kamu: "Mohon maaf, saya hanya dapat membantu memberikan informasi seputar layanan dan profil PT Utero Kreatif Indonesia. Apakah ada yang ingin ditanyakan mengenai jasa branding kami?"
    `;
};
```

### C. Backend Route (Proxy)

File `server/src/routes/ai.route.ts` (atau Next.js API Route) berfungsi meneruskan pesan ke OpenRouter.

```typescript
// pages/api/ai/chat.ts (Contoh Next.js API Route)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, model } = req.body;

  // Default ke Gemma jika model tidak dipilih
  const selectedModel = model || 'google/gemma-3-27b-it:free';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://utero.id', // Domain Production
            'X-Title': 'Utero AI Avatar',
        },
        body: JSON.stringify({
            model: selectedModel,
            messages: [
                // Inject System Prompt di sini agar AI "ingat" siapa dirinya
                { role: 'system', content: "Kamu adalah AI Utero. Jawab hanya soal Utero." }, 
                { role: 'user', content: message }
            ]
        })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghubungi OpenRouter' });
  }
}
```

---

## 📂 Struktur Folder

```text
utero-ai/
├── client/
│   ├── components/
│   │   ├── AvatarCanvas.tsx   # Komponen Visual 3D/2D Avatar
│   │   └── VoiceControl.tsx   # Tombol Mic & Logic STT
│   ├── constants/
│   │   └── ai.ts              # System Prompt definition
│   └── hooks/
│       └── useVoiceAI.ts      # Custom hook untuk logic bicara
├── pages/
│   └── api/
│       └── chat.ts            # Backend route ke OpenRouter
├── public/
├── .env.local
└── package.json
```

---

## 📝 Catatan Pengembangan

- **Audio Permission**: Pastikan browser user memberikan izin akses mikrofon.
- **Latency**: Karena menggunakan layanan free tier, mungkin ada sedikit jeda respon. Model **Xiaomi Mimo** direkomendasikan jika kecepatan adalah prioritas utama.
- **Browser Support**: Web Speech API (STT/TTS) bekerja paling baik di Google Chrome dan Edge.

---

Built with ❤️ for **PT Utero Kreatif Indonesia**
