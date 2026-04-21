# UI5 AI Integration Patterns

## Calling CAP action from UI5 controller
const oModel = this.getView().getModel();
const oContext = oModel.bindContext("/searchAI(...)");
oContext.setParameter("query", sQuery);
await oContext.execute();
const oResult = oContext.getBoundContext().getObject();
// oResult.answer, oResult.results

## Busy state pattern
this.getView().setBusy(true);
try {
  // ... AI call
} finally {
  this.getView().setBusy(false);
}

## Display AI answer in view XML
<m:Panel headerText="AI Answer">
  <m:Text text="{answer}" wrapping="true"/>
</m:Panel>