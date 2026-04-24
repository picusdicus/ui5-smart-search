namespace smart.search;

using { cuid, managed } from '@sap/cds/common';

entity Customers : cuid, managed {
    name        : String(100);
    email       : String(200);
    phone       : String(50);
    address     : String(500);
    country     : String(100);
    embedding   : LargeBinary
        @Core.MediaType          : 'application/octet-stream'
        @cds.persistence.exists  : false;  // HDI defines this as REAL_VECTOR(768)
}

entity Products : cuid, managed {
    name        : String(200);
    description : String(1000);
    category    : String(100);
    price       : Decimal(15, 2);
    currency    : String(3);
    stock       : Integer;
    embedding   : LargeBinary
        @Core.MediaType          : 'application/octet-stream'
        @cds.persistence.exists  : false;  // HDI defines this as REAL_VECTOR(768)
}

entity SalesOrders : cuid, managed {
    orderDate   : Date;
    status      : String(50);
    customer    : Association to Customers;
    totalAmount : Decimal(15, 2);
    currency    : String(3);
    notes       : String(1000);
    embedding   : LargeBinary
        @Core.MediaType          : 'application/octet-stream'
        @cds.persistence.exists  : false;  // HDI defines this as REAL_VECTOR(768)
}

entity Invoices : cuid, managed {
    invoiceDate : Date;
    dueDate     : Date;
    status      : String(50);
    salesOrder  : Association to SalesOrders;
    amount      : Decimal(15, 2);
    currency    : String(3);
    notes       : String(1000);
    embedding   : LargeBinary
        @Core.MediaType          : 'application/octet-stream'
        @cds.persistence.exists  : false;  // HDI defines this as REAL_VECTOR(768)
}

entity SalesOrderItems : cuid, managed {
    salesOrder  : Association to SalesOrders;
    product     : Association to Products;
    quantity    : Integer;
    unitPrice   : Decimal(15, 2);
    currency    : String(3);
    embedding   : LargeBinary
        @Core.MediaType          : 'application/octet-stream'
        @cds.persistence.exists  : false;  // HDI defines this as REAL_VECTOR(768)
}

entity SyncLog : managed {
  key entityName  : String(50);
  lastSyncTime    : DateTime;
  recordsSynced   : Integer;
}
