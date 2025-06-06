// worker-mdm.js
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import axios from 'axios';

const REGION = 'us-east-1';
const QUEUE_URL = process.env.SQS_MDM_URL;
const GINGER_QUEUE_URL = process.env.SQS_GINGER_URL;
const MDM_API_URL = process.env.MDM_API_URL || 'https://example.com/mdm';

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

    console.log(`[${fulfillmentId}] Processing MDM (attempt ${attempt})`);

    try {
      const response = await axios.post(MDM_API_URL, { businessName });
      console.log(`[${fulfillmentId}] MDM success:`, response.data);

      if (response.data.needsGinger) {
        console.log(`[${fulfillmentId}] Sending to Ginger queue...`);
        await sqs.send(new SendMessageCommand({
          QueueUrl: GINGER_QUEUE_URL,
          MessageGroupId: 'fulfillment',
          MessageDeduplicationId: fulfillmentId,
          MessageBody: JSON.stringify({
            fulfillmentId,
            businessName,
            type: 'ginger',
            attempt: 1,
            timestamp: new Date().toISOString()
          }),
        }));
      }

      await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle }));
    } catch (err) {
      console.error(`[${fulfillmentId}] MDM call failed.`, err.message);
      // Optionally implement DLQ or retry logic here
    }
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

setInterval(pollQueue, 15000);

