export default function AboutPage() {
  return (
    <s-page
      heading="About"
      back-action-url="/app"
      back-action-content="Home"
    >
      <s-section>
        <div style={{ marginBottom: 20 }}>
          <img
            src="https://cdn.shopify.com/s/files/1/0630/7086/3520/files/weblegslogo.webp?v=1724321781"
            alt="Weblegs Logo"
            style={{ height: 40 }}
          />
        </div>
        <s-paragraph>
          Our Bundle App, developed by Weblegs, allows customers to easily
          combine selected products into customized bundles, offering flexibility
          and value for their purchases. With this powerful tool, businesses can
          enhance the shopping experience by encouraging customers to purchase
          related items together, ultimately boosting sales. The app integrates
          seamlessly with Shopify, making it simple to manage and customize
          bundle options based on customer preferences. It&apos;s the perfect
          solution for creating unique offers that cater to different needs,
          increasing both engagement and overall order value.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
