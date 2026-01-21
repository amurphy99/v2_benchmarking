import { Download, downloadData } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

export const useDownload = () =>
    useModelQuery<Download>({
        queryKey: "download",
        queryFn : downloadData,
    });