require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const mysql = require('mysql2');
const axios = require('axios');
const { morganMiddleware } = require('./logger');


const app = express();

const saltRounds = 10;
const port = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const corsOptions = {
  origin: process.env.CORS_ORIGIN, // Origen permitido
  methods: process.env.CORS_METHODS, // Métodos permitidos
  credentials: true, // Credenciales permitidas
  /*
  allowedHeaders: 'Content-Type', // Cabecerass permitidas
  optionsSuccessStatus: 204 // Respuesta para preflight
  */
};
const db = mysql.createConnection({ //configuración de la conexión a la base de datos
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) throw err;
  console.log('Conectado a la base de datos');
});


// MIDDLEWARES
app.use(cors(corsOptions));
app.use(express.json()); // to support JSON-encoded bodies
app.use(express.urlencoded({ extended: false })); // to support URL-encoded bodies //true para que se pueda recibir el body como un objeto JSON

app.use(morganMiddleware); // LOGGER
/*
app.use((req, res, next) => {
  console.log(`Route: ${req.url} Method: ${req.method}`);
  next();
});
*/

// API SERVICE LOGIN AND REGISTER
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  //verificar si existe el usuario
  db.query('SELECT * FROM users WHERE email = ?', [email], (err, result) => {
    if (err) throw err;
    if (result.length === 0) {
      res.status(401).send('Unauthorized');
    } else {
      bcrypt.compare(password, result[0].password, (err, isMatch) => { // comprobar contraseña 
        if (err) throw err;

        if (!isMatch) {
          res.status(401).send('Unauthorized');
        } else {
          const token = jwt.sign({ email: email, id: result[0].id }, SECRET_KEY, { expiresIn: '1h' });
          res.json({ token, id: result[0].id });
        }
      });
    }
  });
});

app.post('/api/register', async (req, res) => {
  const { email, password, tokenReCaptcha } = req.body;

  if(!tokenReCaptcha){    //hay tokenReCaptcha?
    res.status(400).send('Error: tokenReCaptcha is required');
  }

      try {                  //verificar si el token de recaptcha es válido
        const response = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, null, {
          params: {
            secret: RECAPTCHA_SECRET_KEY,
            response: tokenReCaptcha,
          },
        });

    const data = response.data;

    if (data.success) {    //si es válido, continuar

      bcrypt.hash(password, saltRounds , (err1, hash) => {        //hashear la contraseña
        if (err1) throw err1;
        try{                  //añadir usuario
          db.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, hash], (err, result) => {
            if (err) throw err;
            console.log(result.insertId)
            const token = jwt.sign({ email: email, id: result.insertId }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ token, id: result.insertId });
          });
        } catch (err) {      //si no se puede realizar la petición, devolver error
          res.status(500).send(err);
        }
      });

    } else {               //si no es válido, devolver error
      res.status(400).send('Error: tokenReCaptcha is invalid');
    }

  } catch (error) {        //si no se puede realizar la petición, devolver error
    console.log(error);
  }

});

//middleware  AUTHENTICATION
app.use((req, res, next) => {
  const token = req.headers.authorization;
  if (token) {
    jwt.verify(token, SECRET_KEY, (err, decoded) => {  //verificar si el token JWT es válido
      if (err) return res.status(401).send('Unauthorized');   //si no es válido, devolver error
      req.user = decoded;
      next();  //si es válido, continuar
    });
  } else {
    res.status(401).send('Unauthorized'); //si no hay token, devolver unauthorized
  }
});

// APIs notes
app.get('/api/notes/:userId', (req, res) => { //devolver una lista de notas
  try {
    db.query('SELECT * FROM note WHERE user_id = ?', [req.params.userId], (err, result) => {
      if (err) throw err;
      res.json(result);
    });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/note/:id', (req, res) => { //devolver una nota por id
  try {
    db.query('SELECT * FROM note WHERE id = ?', [req.params.id], (err, result) => {
      if (err) throw err;
      res.json(result[0]);
    });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post('/api/note/', (req, res) => { //crear una nota
  const { title, body, id_user} = req.body;
  console.log(id_user);
  try {
    db.query('INSERT INTO note (title, body, user_id) VALUES (?, ?, ?)', [title, body, id_user], (err, result) => {
      if (err) {
        res.status(500).send(err);
      };
      res.status(204).end();
    });
  } catch (err) {
    res.status(500).send(err);
  }
  //res.send(`Crear un nuevo post, recibe title y body - devolver 204`);
});

app.put('/api/note/:id', (req, res) => { //actualizar una nota
  const { title, body } = req.body;
  try {
    db.query('UPDATE note SET title = ?, body = ? WHERE id = ?', [title, body, req.params.id], (err, result) => {
      console.log(result);
      if (err) {
        res.status(500).send(err);
      };
      
      res.status(204).end();
    });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.delete('/api/note/:id', (req, res) => { //eliminar una nota
  try {
    db.query('DELETE FROM note WHERE id = ?', [req.params.id], (err, result) => {
      if (err) {
        res.status(500).send(err);
      };
      res.status(204).end();
    });
  } catch (err) {
    res.status(500).send(err);
  }
});
/*
app.patch('/api/post/:id', (req, res) => {
  console.log(...req.body, id:3); //body de la peticion mas el id
  console.log(req.query.id); //id del post por valores get ?id=1 UTIL PARA PAGINACION MANDAR LAS PRIMERAS 10 EN UNA QUERY ?page=1
  res.send(`Actualizar un post devolver 200`);
  res.sendFile('index.html');
  res.sendFile('index.png', { root: __dirname });  //video X
});
*/
app.use((req, res) => { //devolver 404 si no se encuentra la ruta
  res.status(404).send('Not found');
});

//start server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});