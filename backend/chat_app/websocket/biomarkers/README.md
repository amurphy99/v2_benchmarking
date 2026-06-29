# Speech System // Biomarkers <br> `backend/chat_app/websocket/biomarkers/..`

All preprocessing, feature extraction, and calculation code for our speech biomarkers.

<hr>

# Biomarker Score Scale
Biomarker scores are returned on a scale of 0-1 with 0 being the worst (indicitive of cognitive impairment) and 1 being the best. Model outputs are scaled differently to reach this point.

* **Prosody:** Model predictions are scaled according to the percentile the predictions were in relative to the training data. For example: if the models rated this sample as higher than 80% of the training samples, we would assign it an MMSE/MoCA score from the 80th percentile of training scores, let's say ~28. Then we take this score and divide it by the maximum possible score, 30. Finally we clip values to be between 0 and 1.

* **Altered Grammar:** ... work in progress ...


## To move model files after uploading them to the virtual machine

```bash
mv ~/fold_0_train_preds.npy ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_1_train_preds.npy ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_2_train_preds.npy ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_3_train_preds.npy ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_4_train_preds.npy ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_5_train_preds.npy ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_0.txt ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_1.txt ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_2.txt ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_3.txt ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_4.txt ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
mv ~/fold_5.txt ~/v2_benchmarking/backend/chat_app/websocket/biomarkers/models/prosody/
```


