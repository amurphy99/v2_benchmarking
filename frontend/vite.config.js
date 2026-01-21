import { defineConfig } from 'vite'
import { VitePWA      } from 'vite-plugin-pwa'
import react       from '@vitejs/plugin-react'
import path        from "node:path";
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [react(), tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name             : 'AI Assistant Chat with Biomarkers',
                short_name       : 'AI Chat',
                start_url        : '.',
                display          : 'standalone',
                background_color : '#ffde59',
                theme_color      : '#ffffff',
                icons            : [{"src": "3d-icon-robot-1.png", "sizes": "192x192", "type": "image/png"},
                                    {"src": "3d-icon-robot-2.png", "sizes": "512x512", "type": "image/png"},]
            },
            workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 }, // 5MB
        })
    ],
    server: {
        host         : "0.0.0.0",      // listen on all interfaces (not just localhost)
        port         : 5173,
        strictPort   : true,           // make sure it uses 5173
        cors         : true,           // allow cross-origin access if needed
        proxy        : {
            '/ws'  : {target: 'http://127.0.0.1:8000', ws: true}, // backend
            '/api' : {target: 'http://127.0.0.1:8000', },         // changeOrigin: true,
        },
        allowedHosts : ["localhost", "127.0.0.1", "frontend", "cognibot.org", "deployment.cognibot.org", "sandbox.cognibot.org"], 
    },
    preview: {
        host         : "0.0.0.0",
        port         : 5173,
        strictPort   : true,
        cors         : true,
        allowedHosts : ["localhost", "127.0.0.1", "frontend", "cognibot.org", "deployment.cognibot.org", "sandbox.cognibot.org"],
    },
    resolve: { alias: { "@": path.resolve(__dirname, "src"), },}, // sets the "@" symbol to the src directory, makes things quicker sometimes
})
