import { request } from "../client";
import { Download } from "../models";

// GET & PUT
export const downloadData = () => request<Download>("/download/");