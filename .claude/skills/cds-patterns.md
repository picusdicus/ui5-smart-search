# CDS Coding Patterns for Smart Search

## Vector Column Pattern
entity MyEntity {
  key ID        : UUID;
  description   : String;
  embedding     : LargeBinary; // stores serialized float32 array
}

## Action Pattern in .cds
service SearchService {
  action searchAI(query: String) 
    returns { answer: String; results: array of String; };
}

## Handler Pattern in .js
srv.on('searchAI', async (req) => {
  try {
    const { query } = req.data;
    // ... logic
    return { answer, results };
  } catch(e) {
    req.error(500, e.message);
  }
});