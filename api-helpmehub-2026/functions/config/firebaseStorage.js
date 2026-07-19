// backend/config/firebaseStorage.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const storage = new Storage({
    keyFilename: path.join(__dirname, 'firebase-key.json'),
});

const bucketName = 'chatbot-storage-2025';
const bucket = storage.bucket(bucketName);

const uploadBase64ToCloud = async (base64Image) => {
    try {
        const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid Base64 format');
        }

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const extension = mimeType.split('/')[1];
        
        const fileName = `chat_images/img_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
            metadata: { contentType: mimeType }
        });

        const [publicUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '01-01-2100' 
        });
        
        return publicUrl;
    } catch (error) {
        console.error('Error uploading to Firebase:', error);
        return null; 
    }
};

module.exports = { uploadBase64ToCloud };