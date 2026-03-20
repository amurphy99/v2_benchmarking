import { StrictMode    } from "react";
import { createRoot    } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { Toaster } from "react-hot-toast";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const qc = new QueryClient();


import "bootstrap/dist/css/bootstrap.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={qc}> 
      <BrowserRouter>
        <App />
        <Toaster position="top-right" /> {/* Toast pop-up container */}
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
