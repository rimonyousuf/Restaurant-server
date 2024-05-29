const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.h8beuz9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCOllection = client.db("bistroDB").collection("users");
    const menuCOllection = client.db("bistroDB").collection("menu");
    const reviewCOllection = client.db("bistroDB").collection("reviews");
    const cartCOllection = client.db("bistroDB").collection("carts");
    const paymentCOllection = client.db("bistroDB").collection("payments");

    // user related api

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
      res.send({ token });
    })

    // middleware
    const verifyToken = (req, res, next) => {
      console.log('Inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next()
      })
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCOllection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCOllection.find().toArray();
      res.send(result)
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { email: email }
      const user = await userCOllection.findOne(query)
      let admin = false;
      if (user) {
        admin = user?.role === 'admin'
      }
      res.send({ admin })
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCOllection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCOllection.insertOne(user);
      res.send(result);
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCOllection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCOllection.deleteOne(query);
      res.send(result);
    })

    // menu related api
    app.get('/menu', async (req, res) => {
      const result = await menuCOllection.find().toArray();
      res.send(result);
    })

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCOllection.findOne(query);
      res.send(result);
    })

    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCOllection.insertOne(item)
      res.send(result);
    });

    app.patch('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }
      }
      const result = await menuCOllection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCOllection.deleteOne(query);
      res.send(result);
    })

    app.get('/reviews', async (req, res) => {
      const result = await reviewCOllection.find().toArray();
      res.send(result);
    })

    // carts related api
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCOllection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCOllection.insertOne(cartItem);
      res.send(result);
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCOllection.deleteOne(query);
      res.send(result);
    })

    // Payment
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCOllection.find(query).toArray();
      res.send(result)
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCOllection.insertOne(payment)

      // carefully delete each item from the cart
      const query = {
        _id: {
          $in: payment.cartIds.map(id => new ObjectId(id))
        }
      }
      const deleteResult = await cartCOllection.deleteMany(query)
      res.send({ paymentResult, deleteResult });
    })

    // stats or analytics
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCOllection.estimatedDocumentCount();
      const menuItems = await menuCOllection.estimatedDocumentCount();
      const orders = await paymentCOllection.estimatedDocumentCount();

      // This is not the best way
      // const payments = await paymentCOllection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0)

      // The best way
      const result = await paymentCOllection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Server is running")
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})