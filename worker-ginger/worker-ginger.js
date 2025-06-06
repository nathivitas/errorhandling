
// worker-ginger.js
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import axios from 'axios';

const REGION = 'us-east-1';
const QUEUE_URL = process.env.SQS_GINGER_URL;
const GINGER_API_URL = process.env.GINGER_API_URL || 'https://example.com/ginger';

const sqs = new SQSClient({ region: REGION });

async function pollQueue() {
  const params = {
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 10,
  };

  try {
    const data = await sqs.send(new ReceiveMessageCommand(params));
    if (!data.Messages || data.Messages.length === 0) {
      console.log('No messages to process.');
      return;
    }

    const message = data.Messages[0];
    const receiptHandle = message.ReceiptHandle;
    const payload = JSON.parse(message.Body);
    const { fulfillmentId, businessName, attempt } = payload;

    console.log(`[${fulfillmentId}] Processing Ginger (attempt ${attempt})`);

    try {
      const response = await axios.post(GINGER_API_URL, { businessName });
      console.log(`[${fulfillmentId}] Ginger success:`, response.data);

      await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle }));
    } catch (err) {
      console.error(`[${fulfillmentId}] Ginger call failed.`, err.message);
      // Optionally requeue or DLQ here
    }
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

setInterval(pollQueue, 15000);
