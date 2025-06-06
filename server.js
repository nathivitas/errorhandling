import express from 'express';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

const REGION = 'us-east-1';
const sqs = new SQSClient({ region: REGION });

const mdmQueueUrl = process.env.SQS_MDM_URL;
const gingerQueueUrl = process.env.SQS_GINGER_URL;

// ✅ Add this GET route for ALB health checks
app.get('/', (req, res) => {
  res.status(200).send('Health check OK');
});

app.post('/fulfill', async (req, res) => {
  const { businessName, shouldFailMdm, shouldFailGinger } = req.body;
  const fulfillmentId = randomUUID();

  try {
    console.log(`[${fulfillmentId}] Starting fulfillment`);

    if (shouldFailMdm) throw new Error('Simulated MDM failure');
    console.log(`[${fulfillmentId}] MDM succeeded`);

    if (shouldFailGinger) throw new Error('Simulated Ginger failure');
    console.log(`[${fulfillmentId}] Ginger succeeded`);

    res.status(200).json({ message: 'Fulfillment successful', fulfillmentId });
  } catch (err) {
    const queueUrl = err.message.includes('MDM') ? mdmQueueUrl : gingerQueueUrl;
    console.log(`[${fulfillmentId}] Failure detected, sending to retry: ${queueUrl}`);

    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageGroupId: 'fulfillment',
      MessageDeduplicationId: fulfillmentId,
      MessageBody: JSON.stringify({
        fulfillmentId,
        businessName,
        type: err.message.includes('MDM') ? 'mdm' : 'ginger',
        attempt: 1,
        timestamp: new Date().toISOString()
      }),
    }));

    res.status(500).json({ message: 'Failed and routed to retry queue', error: err.message, fulfillmentId });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`YP-Fulfillment backend running on port ${PORT}`);
});
