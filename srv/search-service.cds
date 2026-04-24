using { smart.search as db } from '../db/schema';

service SearchService @(path: '/search') {

    @readonly entity Customers  as projection on db.Customers  excluding { embedding };
    @readonly entity Products   as projection on db.Products   excluding { embedding };
    @readonly entity SalesOrders as projection on db.SalesOrders excluding { embedding };
    @readonly entity Invoices        as projection on db.Invoices        excluding { embedding };
    @readonly entity SalesOrderItems as projection on db.SalesOrderItems excluding { embedding };

    action searchAI(query: String) returns {
        answer        : String;
        results       : array of String;
        entityTypes   : array of String;
        isMultiEntity : Boolean;
        generatedSQL  : String;
    };

    action suggestCustomer(query: String) returns {
        suggestedFields  : String;
        similarBPId      : String;
        similarBPName    : String;
        duplicateWarning : Boolean;
    };
}
